import { Vibration } from 'react-native';

import {
  adjustStopwatch,
  getStopwatchState,
  pauseStopwatch,
  remainingMs,
  resetStopwatch,
  startStopwatch,
} from '../stopwatch';

const mockPlay = jest.fn();

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play: mockPlay, pause: jest.fn(), seekTo: jest.fn(), volume: 1 }),
  setAudioModeAsync: () => Promise.resolve(),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

/** Uhr starten und das stumme „Anwerfen“ fürs Browser-Audio überspringen */
function start() {
  startStopwatch();
  jest.advanceTimersByTime(100);
  mockPlay.mockClear();
}

describe('Stoppuhr', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    resetStopwatch(5 * 60_000);
    mockPlay.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('pfeift genau nach Ablauf der Spielzeit ab (plus Vibration), nur einmal', () => {
    start();
    jest.advanceTimersByTime(5 * 60_000 - 1000);
    expect(mockPlay).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1500);
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(Vibration.vibrate).toHaveBeenCalled();
    expect(getStopwatchState().whistled).toBe(true);

    jest.advanceTimersByTime(10_000);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('Pause hält die Restzeit fest, danach läuft der Rest weiter', () => {
    start();
    jest.advanceTimersByTime(60_000);
    pauseStopwatch();
    jest.advanceTimersByTime(10 * 60_000);
    expect(mockPlay).not.toHaveBeenCalled();
    expect(remainingMs(getStopwatchState())).toBeCloseTo(4 * 60_000, -3);

    start();
    jest.advanceTimersByTime(4 * 60_000 - 1000);
    expect(mockPlay).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1500);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('Spielzeit bleibt zwischen 1 und 90 Minuten', () => {
    resetStopwatch(60_000);
    adjustStopwatch(-5);
    expect(getStopwatchState().durationMs).toBe(60_000);
    resetStopwatch(90 * 60_000);
    adjustStopwatch(1);
    expect(getStopwatchState().durationMs).toBe(90 * 60_000);
  });
});
