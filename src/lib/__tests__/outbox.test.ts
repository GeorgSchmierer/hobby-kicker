/**
 * Warteschlange des Offline-Modus: Einträge ohne Netz merken, später senden,
 * vom Server abgelehnte (doppelte) Einträge verwerfen – ohne doppelte Wertung.
 */
// Gerätespeicher, der auch einen „Neustart“ (frisch geladenes Modul) übersteht
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    mockStorage.set(key, value);
  },
}));

const mockRpc = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  errorMessage: (e: { message?: string }) => e?.message ?? '',
}));

type Outbox = typeof import('../outbox');

const offline = () => Promise.resolve({ error: { message: 'TypeError: Failed to fetch', code: '' } });
const ok = () => Promise.resolve({ error: null });
const rejected = (message: string) => Promise.resolve({ error: { message, code: 'P0001' } });

function load(): Outbox {
  let mod!: Outbox;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- frisches Modul je Test
    mod = require('../outbox');
  });
  return mod;
}

const start = (id: string) => ({
  kind: 'start' as const,
  id,
  groupId: 'g',
  teamIds: ['t1', 't2'],
  teams: [['a'], ['b']],
  playedOn: '2026-09-25',
  createdAt: '',
  userId: null,
});

const result = (id: string, sessionId: string, matchNo = 1) => ({
  kind: 'result' as const,
  id,
  groupId: 'g',
  sessionId,
  matchNo,
  resultKind: 'match' as const,
  teamA: 't1',
  teamB: 't2',
  outcome: 'a' as const,
  goals: null,
  createdAt: '',
});

beforeEach(() => {
  mockRpc.mockReset();
  mockStorage.clear();
});

describe('Warteschlange (Offline-Modus)', () => {
  it('mit Netz: sofort gespeichert', async () => {
    mockRpc.mockImplementation(ok);
    const outbox = load();
    await expect(outbox.submit(start('s1'))).resolves.toBe('saved');
    expect(outbox.outboxState().ops).toHaveLength(0);
  });

  it('ohne Netz: wartet, und wird in der richtigen Reihenfolge nachgereicht', async () => {
    mockRpc.mockImplementation(offline);
    const outbox = load();
    await expect(outbox.submit(start('s1'))).resolves.toBe('queued');
    await expect(outbox.submit(result('r1', 's1'))).resolves.toBe('queued');
    expect(outbox.outboxState().offline).toBe(true);
    expect(outbox.pendingResults('s1')).toHaveLength(1);

    mockRpc.mockReset();
    mockRpc.mockImplementation(ok);
    await outbox.flush();
    expect(outbox.outboxState().ops).toHaveLength(0);
    expect(outbox.outboxState().offline).toBe(false);
    expect(mockRpc.mock.calls.map((c) => c[0])).toEqual(['start_session_v2', 'record_result_v2']);
    expect(mockRpc.mock.calls[1][1]).toMatchObject({ p_id: 'r1', p_session: 's1', p_match_no: 1 });
  });

  it('übersteht einen Neustart der App (Warteschlange ist gespeichert)', async () => {
    mockRpc.mockImplementation(offline);
    await load().submit(result('r1', 's1'));
    await new Promise((r) => setTimeout(r, 0));
    const restarted = load();
    await restarted.flush();
    expect(restarted.outboxState().ops.map((o) => o.id)).toEqual(['r1']);
  });

  it('erneutes Senden nach verlorener Antwort nutzt dieselbe ID (Server wertet nicht doppelt)', async () => {
    mockRpc.mockImplementationOnce(offline).mockImplementation(ok);
    const outbox = load();
    await outbox.submit(result('r1', 's1'));
    await outbox.flush();
    const ids = mockRpc.mock.calls.map((c) => c[1].p_id);
    expect(ids).toEqual(['r1', 'r1']);
  });

  it('doppelt eingetragen (anderes Handy war schneller): verworfen mit verständlichem Hinweis', async () => {
    mockRpc.mockImplementation(offline);
    const outbox = load();
    await outbox.submit(result('r1', 's1'));
    await outbox.submit(result('r2', 's1', 2));
    mockRpc.mockReset();
    mockRpc
      .mockImplementationOnce(() => rejected('DOPPELT: Diese Partie hat schon jemand anderes eingetragen.'))
      .mockImplementation(ok);
    await outbox.flush();
    const state = outbox.outboxState();
    expect(state.ops).toHaveLength(0);
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].text).toMatch(/verworfen: Diese Partie hat schon jemand anderes eingetragen/);
    // die zweite Partie kam trotzdem an
    expect(mockRpc).toHaveBeenCalledTimes(2);
    outbox.dismissNotice(state.notices[0].id);
    expect(outbox.outboxState().notices).toHaveLength(0);
  });

  it('abgelehnter Spieltag nimmt seine Ergebnisse mit', async () => {
    mockRpc.mockImplementation(offline);
    const outbox = load();
    await outbox.submit(start('s1'));
    await outbox.submit(result('r1', 's1'));
    mockRpc.mockReset();
    mockRpc.mockImplementation(() => rejected('Ein Spieler gehört nicht zu dieser Gruppe.'));
    await outbox.flush();
    expect(outbox.outboxState().ops).toHaveLength(0);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('mit Netz, aber vom Server abgelehnt: Fehler direkt an den Aufrufer, kein Hinweis', async () => {
    mockRpc.mockImplementation(() => rejected('Ungültiges Ergebnis.'));
    const outbox = load();
    await expect(outbox.submit(result('r1', 's1'))).rejects.toMatchObject({ message: 'Ungültiges Ergebnis.' });
    expect(outbox.outboxState().notices).toHaveLength(0);
  });
});
