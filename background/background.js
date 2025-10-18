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

// 알림 아이콘 캐시
let cachedNotificationIcon = null;

// PNG 파일을 data URL로 변환
async function loadNotificationIcon() {
  if (cachedNotificationIcon) {
    return cachedNotificationIcon;
  }

  try {
    const url = chrome.runtime.getURL('icons/notification-icon.png');
    const response = await fetch(url);
    const blob = await response.blob();

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    cachedNotificationIcon = dataUrl;
    return dataUrl;
  } catch (error) {
    return null;
  }
}

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
async function onPointTimerExpired() {
  // 타이머 활성화 상태 및 알림 설정 확인
  chrome.storage.sync.get([
    'timerEnabled_point',
    'pointNotification_system',
    'pointNotification_visual'
  ], async (result) => {
    const pointTimerEnabled = result.timerEnabled_point !== false;
    if (!pointTimerEnabled) return;

    // 기본값: 모두 활성화
    const systemNotifEnabled = result.pointNotification_system !== false;
    const visualAlertsEnabled = result.pointNotification_visual !== false;

    // 시스템 알림
    if (systemNotifEnabled) {
      // 아이콘 로드
      const iconDataUrl = await loadNotificationIcon();

      if (iconDataUrl) {
        // 시스템 알림 생성 (data URL 사용)
        chrome.notifications.create({
          type: 'basic',
          iconUrl: iconDataUrl,
          title: '🎁 성좌님 출현!',
          message: '포인트를 수집할 시간입니다. 클릭하여 enterjoy로 이동하세요.',
          priority: 2,
          requireInteraction: true  // 사용자가 클릭할 때까지 유지
        }, (notificationId) => {
          if (!chrome.runtime.lastError) {
            // 1분(60000ms) 후 자동으로 알림 제거
            setTimeout(() => {
              chrome.notifications.clear(notificationId);
            }, 60000); // 60초 = 1분
          }
        });
      }
    }

    // 시각적 알림 (Badge 깜빡임)
    if (visualAlertsEnabled) {
      startBadgeFlashing();
    }

    // storage에서 enterjoy 탭 ID 로드 후 메시지 전송 (시각적 알림 설정 포함)
    chrome.storage.local.get([ENTERJOY_TABS_KEY], (result) => {
      const tabIds = result[ENTERJOY_TABS_KEY] || [];
      if (tabIds.length === 0) return;

      tabIds.forEach((tabId) => {
        chrome.tabs.sendMessage(tabId, {
          action: 'pointTimerExpired',
          visualAlertsEnabled: visualAlertsEnabled
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

// ========== 알림 클릭 이벤트 처리 ==========

// 알림 클릭 시 enterjoy 탭으로 이동
chrome.notifications.onClicked.addListener((notificationId) => {
  // 알림 제거
  chrome.notifications.clear(notificationId);

  // Badge 깜빡임 중지
  stopBadgeFlashing();

  // enterjoy 탭 찾기 또는 새로 열기
  chrome.storage.local.get([ENTERJOY_TABS_KEY], (result) => {
    const tabIds = result[ENTERJOY_TABS_KEY] || [];

    if (tabIds.length > 0) {
      // 첫 번째 enterjoy 탭으로 이동
      chrome.tabs.update(tabIds[0], { active: true }, () => {
        if (chrome.runtime.lastError) {
          // 탭이 이미 닫혔으면 새 탭 생성
          chrome.tabs.create({ url: 'https://enterjoy.day' });
        } else {
          // 탭의 윈도우도 활성화
          chrome.tabs.get(tabIds[0], (tab) => {
            if (!chrome.runtime.lastError && tab.windowId) {
              chrome.windows.update(tab.windowId, { focused: true });
            }
          });
        }
      });
    } else {
      // enterjoy 탭이 없으면 새로 생성
      chrome.tabs.create({ url: 'https://enterjoy.day' });
    }
  });
});

