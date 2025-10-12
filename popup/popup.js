// 팝업이 로드될 때 실행
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const testBtn = document.getElementById('testBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusText = document.getElementById('statusText');
  const timerValue = document.getElementById('timerValue');
  const cooldownDisplay = document.getElementById('cooldownDisplay');
  const statusMessage = document.getElementById('statusMessage');
  const statusIcon = statusMessage.querySelector('.status-icon');

  let updateInterval = null;

  // 초기 상태 불러오기
  loadEnabledState();
  updateCooldownStatus();

  // 1초마다 상태 업데이트
  updateInterval = setInterval(updateCooldownStatus, 1000);

  // 활성화/비활성화 토글
  enableToggle.addEventListener('change', async function() {
    const isEnabled = enableToggle.checked;

    // 설정 저장
    chrome.storage.sync.set({ enabled: isEnabled }, function() {
      if (isEnabled) {
        showFeedback('확장프로그램이 활성화되었습니다');
      } else {
        showFeedback('확장프로그램이 비활성화되었습니다');
      }

      // 현재 탭에 메시지 전송
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('enterjoy.day')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateEnabled',
            enabled: isEnabled
          }, function() {
            if (chrome.runtime.lastError) {
              console.log('Content script not loaded yet');
            }
          });
        }
      });
    });
  });

  function loadEnabledState() {
    chrome.storage.sync.get(['enabled'], function(result) {
      const isEnabled = result.enabled !== false; // 기본값: true
      enableToggle.checked = isEnabled;
    });
  }

  // 테스트 버튼 (5초 타이머)
  testBtn.addEventListener('click', async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab && tab.url && tab.url.includes('enterjoy.day')) {
        chrome.tabs.sendMessage(tab.id, { action: 'startTestTimer', duration: 5 }, function(response) {
          if (chrome.runtime.lastError) {
            showFeedback('페이지를 새로고침해주세요');
          } else if (response && response.success) {
            showFeedback('테스트 타이머 시작!');
          }
        });
      } else {
        showFeedback('enterjoy.day에서 실행해주세요');
      }
    } catch (error) {
      console.error('Error starting test timer:', error);
      showFeedback('테스트 실패');
    }
  });

  // 상태 새로고침 버튼
  refreshBtn.addEventListener('click', function() {
    updateCooldownStatus();
    showFeedback('상태를 새로고침했습니다');
  });

  // 타이머 초기화 버튼
  resetBtn.addEventListener('click', async function() {
    const confirmed = confirm('타이머를 초기화하시겠습니까?');
    if (!confirmed) return;

    try {
      // 현재 활성 탭 가져오기
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab && tab.url && tab.url.includes('enterjoy.day')) {
        // content script에 초기화 메시지 전송
        chrome.tabs.sendMessage(tab.id, { action: 'resetCooldown' }, function(response) {
          if (chrome.runtime.lastError) {
            // content script가 로드되지 않은 경우 직접 스토리지 초기화
            chrome.storage.local.remove('enterjoy_last_comment_time', function() {
              updateCooldownStatus();
              showFeedback('타이머가 초기화되었습니다');
            });
          } else if (response && response.success) {
            updateCooldownStatus();
            showFeedback('타이머가 초기화되었습니다');
          }
        });
      } else {
        // enterjoy.day가 아닌 경우 직접 스토리지 초기화
        chrome.storage.local.remove('enterjoy_last_comment_time', function() {
          updateCooldownStatus();
          showFeedback('타이머가 초기화되었습니다');
        });
      }
    } catch (error) {
      console.error('Error resetting timer:', error);
      showFeedback('초기화 실패');
    }
  });

  function updateCooldownStatus() {
    chrome.storage.local.get(['enterjoy_last_comment_time'], function(result) {
      const lastCommentTime = result.enterjoy_last_comment_time;

      if (!lastCommentTime) {
        // 쿨다운 없음
        setCooldownUI(false, 0);
        return;
      }

      const now = Date.now();
      const elapsed = Math.floor((now - lastCommentTime) / 1000);
      const remaining = 20 - elapsed; // 20초 쿨다운

      if (remaining > 0) {
        // 쿨다운 중
        setCooldownUI(true, remaining);
      } else {
        // 쿨다운 완료
        setCooldownUI(false, 0);
      }
    });
  }

  function setCooldownUI(inCooldown, remainingSeconds) {
    if (inCooldown) {
      // 쿨다운 중
      cooldownDisplay.classList.add('active');
      statusMessage.classList.add('cooldown');

      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      statusIcon.textContent = '⏳';
      statusText.textContent = '쿨다운 중';

      // 5초 이하일 때 경고 표시
      if (remainingSeconds <= 5) {
        cooldownDisplay.classList.add('warning');
      } else {
        cooldownDisplay.classList.remove('warning');
      }
    } else {
      // 쿨다운 완료
      cooldownDisplay.classList.remove('active', 'warning');
      statusMessage.classList.remove('cooldown');

      timerValue.textContent = '00:00';
      statusIcon.textContent = '✅';
      statusText.textContent = '댓글 작성 가능';
    }
  }

  function showFeedback(message) {
    statusIcon.textContent = 'ℹ️';
    statusText.textContent = message;

    setTimeout(() => {
      updateCooldownStatus();
    }, 2000);
  }

  // 팝업이 닫힐 때 인터벌 정리
  window.addEventListener('beforeunload', function() {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
});
