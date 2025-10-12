/**
 * Browser API Polyfill
 * Chrome과 Firefox 양쪽 모두 지원
 *
 * - Chrome: chrome.* API 사용
 * - Firefox: browser.* API 사용
 *
 * 기존 Chrome 코드에 영향 없이 Firefox 지원 추가
 */

// Firefox는 browser 객체를 제공, Chrome은 chrome 객체만 제공
if (typeof browser === 'undefined') {
  // Chrome 환경: chrome을 browser로 매핑
  var browser = chrome;
}

// chrome 객체도 유지 (기존 코드 호환성 100% 보장)
if (typeof chrome === 'undefined') {
  // Firefox 환경: browser를 chrome으로도 매핑
  var chrome = browser;
}
