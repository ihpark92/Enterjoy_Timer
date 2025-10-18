// 확장프로그램이 설치되거나 업데이트될 때 실행
chrome.runtime.onInstalled.addListener(function(details) {
  // 기본 설정 초기화
  chrome.storage.sync.set({
    enabled: true,
    version: chrome.runtime.getManifest().version
  });
});

// ========== 성좌 타이머 관리 (chrome.alarms 기반) ==========
const POINT_ALARM_NAME = 'enterjoyPointTimer';
const POINT_INTERVAL_MINUTES = 30; // 30분 간격

// Badge 깜빡임 상태
let badgeFlashInterval = null;
let badgeFlashTimeout = null;

// enterjoy 탭 ID 추적 (storage 키)
const ENTERJOY_TABS_KEY = 'enterjoy_tab_ids';

// 확장프로그램 아이콘 클릭 이벤트
chrome.action.onClicked.addListener(function(tab) {
  // 아이콘 클릭 이벤트 처리
});

// 메시지 리스너
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getData') {
    // 데이터 요청 처리
    chrome.storage.sync.get(null, function(items) {
      sendResponse({ success: true, data: items });
    });
    return true; // 비동기 응답을 위해 true 반환
  }

  // 성좌 타이머 시작 요청 (content script에서)
  if (request.action === 'startPointTimer') {
    // 탭 ID를 storage에 저장
    if (sender.tab && sender.tab.id) {
      chrome.storage.local.get([ENTERJOY_TABS_KEY], (result) => {
        const tabIds = result[ENTERJOY_TABS_KEY] || [];
        if (!tabIds.includes(sender.tab.id)) {
          tabIds.push(sender.tab.id);
          chrome.storage.local.set({ [ENTERJOY_TABS_KEY]: tabIds });
        }
      });
    }

    startPointAlarm();
    sendResponse({ success: true });
    return true;
  }

  // 성좌 타이머 중지 요청
  if (request.action === 'stopPointTimer') {
    stopPointAlarm();
    sendResponse({ success: true });
    return true;
  }

  // Badge 깜빡임 중지 요청 (사용자가 탭 클릭 시)
  if (request.action === 'stopBadgeFlashing') {
    stopBadgeFlashing();
    sendResponse({ success: true });
    return true;
  }

  return true;
});

// 탭 업데이트 이벤트 감지
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    // 탭 로드 완료
  }
});

// ========== 성좌 타이머 함수들 ==========

// 성좌 타이머 시작
function startPointAlarm() {
  // 기존 알람 제거
  chrome.alarms.clear(POINT_ALARM_NAME);

  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();

  let targetMinute;
  let minutesRemaining;

  // 30분 간격 (매시 0분, 30분)
  if (currentMinute < 30) {
    targetMinute = 30;
  } else {
    targetMinute = 60; // 다음 시간의 0분
  }
  minutesRemaining = targetMinute - currentMinute;

  const secondsRemaining = 60 - currentSecond;
  const totalMinutesRemaining = minutesRemaining - (secondsRemaining / 60);

  // 첫 알람 설정
  chrome.alarms.create(POINT_ALARM_NAME, {
    delayInMinutes: totalMinutesRemaining,
    periodInMinutes: POINT_INTERVAL_MINUTES
  });
}

// 성좌 타이머 중지
function stopPointAlarm() {
  chrome.alarms.clear(POINT_ALARM_NAME);
  stopBadgeFlashing();
}

// 알람 이벤트 리스너 (Service Worker가 sleep 상태에서도 작동)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POINT_ALARM_NAME) {
    onPointTimerExpired();
  }
});

// 타이머 만료 시 처리
function onPointTimerExpired() {
  // 타이머 활성화 상태 확인
  chrome.storage.sync.get(['timerEnabled_point'], (result) => {
    const pointTimerEnabled = result.timerEnabled_point !== false;
    if (!pointTimerEnabled) return;

    // Badge 깜빡임 시작
    startBadgeFlashing();

    // storage에서 enterjoy 탭 ID 로드 후 메시지 전송
    chrome.storage.local.get([ENTERJOY_TABS_KEY], (result) => {
      const tabIds = result[ENTERJOY_TABS_KEY] || [];
      if (tabIds.length === 0) return;

      tabIds.forEach((tabId) => {
        chrome.tabs.sendMessage(tabId, {
          action: 'pointTimerExpired'
        }).catch((error) => {
          // "Receiving end does not exist" 오류만 탭 제거 (탭이 닫힌 경우)
          if (error.message && error.message.includes('Receiving end does not exist')) {
            chrome.storage.local.get([ENTERJOY_TABS_KEY], (r) => {
              const ids = r[ENTERJOY_TABS_KEY] || [];
              const filtered = ids.filter(id => id !== tabId);
              chrome.storage.local.set({ [ENTERJOY_TABS_KEY]: filtered });
            });
          }
        });
      });
    });
  });
}

// Badge 깜빡임 시작
function startBadgeFlashing() {
  // 기존 깜빡임 중지
  stopBadgeFlashing();

  let toggle = true;

  // 1초마다 깜빡임
  badgeFlashInterval = setInterval(() => {
    if (toggle) {
      chrome.action.setBadgeText({ text: '🎁' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
    toggle = !toggle;
  }, 1000);

  // 60초 후 자동 중지
  badgeFlashTimeout = setTimeout(() => {
    stopBadgeFlashing();
  }, 60000);
}

// Badge 깜빡임 중지
function stopBadgeFlashing() {
  if (badgeFlashInterval) {
    clearInterval(badgeFlashInterval);
    badgeFlashInterval = null;
  }

  if (badgeFlashTimeout) {
    clearTimeout(badgeFlashTimeout);
    badgeFlashTimeout = null;
  }

  // Badge 제거
  chrome.action.setBadgeText({ text: '' });
}
