// 팝업이 로드될 때 실행
document.addEventListener('DOMContentLoaded', function() {
  const timerCommentToggle = document.getElementById('timerCommentToggle');
  const timerPointToggle = document.getElementById('timerPointToggle');
  const timerAttendanceToggle = document.getElementById('timerAttendanceToggle');
  const themeOptions = document.getElementsByName('theme');
  const timerModeOptions = document.getElementsByName('timerMode');
  const resetPositionBtn = document.getElementById('resetPositionBtn');

  // 초기 상태 불러오기
  migrateOldSettings(); // 기존 설정 마이그레이션
  loadTimerToggles();
  loadThemeSetting();
  loadTimerModeSetting();

  // 댓글 타이머 토글
  timerCommentToggle.addEventListener('change', function() {
    const isEnabled = timerCommentToggle.checked;

    // 설정 저장
    chrome.storage.sync.set({ timerEnabled_comment: isEnabled }, function() {
      // 현재 탭에 메시지 전송
      sendTimerToggleMessage('comment', isEnabled);
    });
  });

  // 성좌 타이머 토글
  timerPointToggle.addEventListener('change', function() {
    const isEnabled = timerPointToggle.checked;

    // 설정 저장
    chrome.storage.sync.set({ timerEnabled_point: isEnabled }, function() {
      // 현재 탭에 메시지 전송
      sendTimerToggleMessage('point', isEnabled);
    });
  });

  // 무료포 타이머 토글
  timerAttendanceToggle.addEventListener('change', function() {
    const isEnabled = timerAttendanceToggle.checked;

    // 설정 저장
    chrome.storage.sync.set({ timerEnabled_attendance: isEnabled }, function() {
      // 현재 탭에 메시지 전송
      sendTimerToggleMessage('attendance', isEnabled);
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

  // 타이머 토글 메시지 전송 헬퍼 함수
  function sendTimerToggleMessage(timerType, isEnabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('enterjoy.day')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateTimerVisibility',
          timerType: timerType,
          enabled: isEnabled
        }, function() {
          if (chrome.runtime.lastError) {
            console.log('Content script not loaded yet');
          }
        });
      }
    });
  }

  // 기존 설정 마이그레이션 (한 번만 실행)
  function migrateOldSettings() {
    chrome.storage.sync.get(['enabled', 'pointInterval', '_migrated'], function(result) {
      // 이미 마이그레이션 되었으면 스킵
      if (result._migrated) {
        return;
      }

      const updates = { _migrated: true };

      // 기존 enabled 설정이 있으면 변환
      if (result.enabled !== undefined) {
        const wasEnabled = result.enabled !== false;
        updates.timerEnabled_comment = wasEnabled;
        updates.timerEnabled_point = wasEnabled;
        updates.timerEnabled_attendance = wasEnabled;
      } else {
        // 기본값: 모두 활성화
        updates.timerEnabled_comment = true;
        updates.timerEnabled_point = true;
        updates.timerEnabled_attendance = true;
      }

      // 설정 저장 및 구 설정 제거
      chrome.storage.sync.set(updates, function() {
        chrome.storage.sync.remove(['enabled', 'pointInterval']);
        console.log('Settings migrated successfully');
      });
    });
  }

  // 타이머 토글 상태 불러오기
  function loadTimerToggles() {
    chrome.storage.sync.get([
      'timerEnabled_comment',
      'timerEnabled_point',
      'timerEnabled_attendance'
    ], function(result) {
      // 기본값: 모두 활성화
      timerCommentToggle.checked = result.timerEnabled_comment !== false;
      timerPointToggle.checked = result.timerEnabled_point !== false;
      timerAttendanceToggle.checked = result.timerEnabled_attendance !== false;
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

});
