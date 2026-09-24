import { detectDevice, isInAppBrowser } from '../install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('detectDevice', () => {
  it('erkennt iPhone, iPad, Android und PC', () => {
    expect(detectDevice(IPHONE)).toBe('ios');
    expect(detectDevice(IPAD_AS_MAC, 5)).toBe('ios');
    expect(detectDevice(IPAD_AS_MAC, 0)).toBe('desktop'); // echter Mac
    expect(detectDevice(ANDROID)).toBe('android');
    expect(detectDevice(WINDOWS)).toBe('desktop');
  });
});

describe('isInAppBrowser', () => {
  it('erkennt Links, die in WhatsApp/Instagram geöffnet wurden', () => {
    expect(isInAppBrowser(`${IPHONE} WhatsApp/2.24`)).toBe(true);
    expect(isInAppBrowser(`${ANDROID} Instagram 300.0`)).toBe(true);
    expect(isInAppBrowser(IPHONE)).toBe(false);
    expect(isInAppBrowser(ANDROID)).toBe(false);
  });
});
