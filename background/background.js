// 확장프로그램이 설치되거나 업데이트될 때 실행
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('EnterJoy Extension installed:', details.reason);

  // 기본 설정 초기화
  chrome.storage.sync.set({
    enabled: true,
    version: chrome.runtime.getManifest().version
  });

  if (details.reason === 'install') {
    // 처음 설치 시 실행할 작업
    console.log('첫 설치입니다. 환영합니다!');
  } else if (details.reason === 'update') {
    // 업데이트 시 실행할 작업
    console.log('확장프로그램이 업데이트되었습니다.');
  }
});

// 확장프로그램 아이콘 클릭 이벤트
chrome.action.onClicked.addListener(function(tab) {
  console.log('Extension icon clicked on tab:', tab.id);
});

// 메시지 리스너
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received:', request);

  if (request.action === 'getData') {
    // 데이터 요청 처리
    chrome.storage.sync.get(null, function(items) {
      sendResponse({ success: true, data: items });
    });
    return true; // 비동기 응답을 위해 true 반환
  }

  return true;
});

// 탭 업데이트 이벤트 감지
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tab.url);
  }
});
