// 팝업이 로드될 때 실행
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const intervalOptions = document.getElementsByName('pointInterval');
  const intervalDescription = document.getElementById('intervalDescription');

  // 초기 상태 불러오기
  loadEnabledState();
  loadIntervalSetting();

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

  function updateIntervalDescription(interval) {
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
