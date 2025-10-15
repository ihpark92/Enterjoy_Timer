// 팝업이 로드될 때 실행
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const intervalOptions = document.getElementsByName('pointInterval');
  const themeOptions = document.getElementsByName('theme');
  const timerModeOptions = document.getElementsByName('timerMode');
  const intervalDescription = document.getElementById('intervalDescription');
  const resetPositionBtn = document.getElementById('resetPositionBtn');

  // 초기 상태 불러오기
  loadEnabledState();
  loadIntervalSetting();
  loadThemeSetting();
  loadTimerModeSetting();

  // 활성화/비활성화 토글
  enableToggle.addEventListener('change', async function() {
    const isEnabled = enableToggle.checked;

    // 설정 저장
    chrome.storage.sync.set({ enabled: isEnabled }, function() {
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

  // 성좌 출현시간 간격 설정
  intervalOptions.forEach(option => {
    option.addEventListener('change', function() {
      const interval = parseInt(this.value);

      // 설정 저장
      chrome.storage.sync.set({ pointInterval: interval }, function() {
        updateIntervalDescription(interval);

        // 현재 탭에 메시지 전송
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('enterjoy.day')) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updatePointInterval',
              interval: interval
            }, function() {
              if (chrome.runtime.lastError) {
                console.log('Content script not loaded yet');
              }
            });
          }
        });
      });
    });
  });

  // 테마 설정
  themeOptions.forEach(option => {
    option.addEventListener('change', function() {
      const theme = this.value;

      // 설정 저장
      chrome.storage.sync.set({ theme: theme }, function() {
        // 현재 탭에 메시지 전송
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('enterjoy.day')) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateTheme',
              theme: theme
            }, function() {
              if (chrome.runtime.lastError) {
                console.log('Content script not loaded yet');
              }
            });
          }
        });
      });
    });
  });

  // 타이머 모드 설정
  timerModeOptions.forEach(option => {
    option.addEventListener('change', function() {
      const mode = this.value;

      // 설정 저장
      chrome.storage.sync.set({ timerMode: mode }, function() {
        // 현재 탭에 메시지 전송
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('enterjoy.day')) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateTimerMode',
              mode: mode
            }, function() {
              if (chrome.runtime.lastError) {
                console.log('Content script not loaded yet');
              }
            });
          }
        });
      });
    });
  });

  // 타이머 위치 초기화 버튼
  resetPositionBtn.addEventListener('click', function() {
    // 버튼 텍스트 변경 (피드백)
    const originalText = resetPositionBtn.textContent;
    resetPositionBtn.textContent = '초기화 중...';
    resetPositionBtn.disabled = true;

    // 현재 탭에 메시지 전송
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('enterjoy.day')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'resetTimerPositions'
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.log('Content script not loaded yet');
            resetPositionBtn.textContent = '페이지를 새로고침 해주세요';
            setTimeout(() => {
              resetPositionBtn.textContent = originalText;
              resetPositionBtn.disabled = false;
            }, 2000);
          } else {
            resetPositionBtn.textContent = '초기화 완료!';
            setTimeout(() => {
              resetPositionBtn.textContent = originalText;
              resetPositionBtn.disabled = false;
            }, 1500);
          }
        });
      } else {
        resetPositionBtn.textContent = 'enterjoy.day에서만 사용 가능';
        setTimeout(() => {
          resetPositionBtn.textContent = originalText;
          resetPositionBtn.disabled = false;
        }, 2000);
      }
    });
  });

  function loadEnabledState() {
    chrome.storage.sync.get(['enabled'], function(result) {
      const isEnabled = result.enabled !== false; // 기본값: true
      enableToggle.checked = isEnabled;
    });
  }

  function loadIntervalSetting() {
    chrome.storage.sync.get(['pointInterval'], function(result) {
      const interval = result.pointInterval || 30; // 기본값: 30분

      // 라디오 버튼 선택
      intervalOptions.forEach(option => {
        if (parseInt(option.value) === interval) {
          option.checked = true;
        }
      });

      updateIntervalDescription(interval);
    });
  }

  function loadThemeSetting() {
    chrome.storage.sync.get(['theme'], function(result) {
      const theme = result.theme || 'color'; // 기본값: color

      // 라디오 버튼 선택
      themeOptions.forEach(option => {
        if (option.value === theme) {
          option.checked = true;
        }
      });
    });
  }

  function loadTimerModeSetting() {
    chrome.storage.sync.get(['timerMode'], function(result) {
      const mode = result.timerMode || 'normal'; // 기본값: normal

      // 라디오 버튼 선택
      timerModeOptions.forEach(option => {
        if (option.value === mode) {
          option.checked = true;
        }
      });
    });
  }

  function updateIntervalDescription(interval) {
    if (!intervalDescription) return; // 요소가 없으면 무시

    let description = '';

    if (interval === 10) {
      description = '매시 0분, 10분, 20분, 30분, 40분, 50분마다 초기화';
    } else if (interval === 20) {
      description = '매시 0분, 20분, 40분마다 초기화';
    } else if (interval === 30) {
      description = '매시 0분, 30분마다 초기화';
    }

    intervalDescription.textContent = description;
  }

});
