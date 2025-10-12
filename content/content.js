// Content Script - 웹 페이지에서 실행됩니다

// 페이지 로드 시 실행
(function() {
  'use strict';

  // 댓글 쿨다운 관리
  const COOLDOWN_TIME = 20; // 20초
  const STORAGE_KEY = 'enterjoy_last_comment_time';
  let cooldownInterval = null;
  let timerElement = null;
  let isExtensionEnabled = true;
  let lastSubmissionCheck = 0; // 마지막 제출 체크 시간 (중복 방지)

  // 포인트 수집 타이머 관리
  let pointTimerInterval = null;
  let pointTimerElement = null;

  // 출석체크 타이머 관리
  const ATTENDANCE_KEY = 'enterjoy_last_attendance_time';
  const ATTENDANCE_TARGET_KEY = 'enterjoy_attendance_target_time'; // 다음 수령 가능 시간
  const ATTENDANCE_TIME = 24 * 60 * 60; // 24시간 (초)
  let attendanceTimerInterval = null;
  let attendanceTimerElement = null;

  // 페이지가 enterjoy.day인지 먼저 확인
  if (!window.location.href.includes('enterjoy.day')) {
    return;
  }

  // 게시판 페이지인지 확인하는 함수
  function isBoardPage() {
    const url = window.location.href;
    // bo_table 파라미터가 있으면 게시판 페이지로 간주
    return url.includes('bo_table=');
  }

  // 게시판 페이지가 아니면 실행하지 않음
  if (!isBoardPage()) {
    // alert 인터셉터만 설정 (출석체크 시간 추출용)
    setupAlertInterceptor();
    return;
  }

  // alert 인터셉터를 가장 먼저 설정 (다른 스크립트보다 먼저)
  setupAlertInterceptor();

  // 설정 확인 (기본값: true)
  chrome.storage.sync.get(['enabled'], function(result) {
    isExtensionEnabled = result.enabled !== false; // undefined일 경우 true로 처리

    if (!isExtensionEnabled) {
      return;
    }

    initializeExtension();
  });

  function setupAlertInterceptor() {
    // alert 감지 (팝업에서 시간 추출)
    const originalAlert = window.alert;
    window.alert = function(message) {
      try {
        extractTimeFromPopup(message);
      } catch (e) {
        console.error('Error extracting time:', e);
      }
      return originalAlert.call(window, message);
    };

    // confirm도 감지
    const originalConfirm = window.confirm;
    window.confirm = function(message) {
      try {
        extractTimeFromPopup(message);
      } catch (e) {
        console.error('Error extracting time:', e);
      }
      return originalConfirm.call(window, message);
    };
  }

  function initializeExtension() {
    // 타이머 UI 생성
    createTimerUI();

    // 포인트 타이머 UI 생성
    createPointTimerUI();

    // 출석체크 타이머 UI 생성
    createAttendanceTimerUI();

    // 저장된 마지막 댓글 시간 확인
    checkCooldownStatus();

    // 포인트 타이머 시작
    startPointTimer();

    // 출석체크 타이머 시작
    startAttendanceTimer();

    // 출석체크 링크 감지
    observeAttendanceLink();

    // 댓글 폼 감지 및 이벤트 리스너 추가
    observeCommentForms();

    // bfcache 복원 감지 (뒤로가기/앞으로가기)
    setupPageShowListener();

    // 페이지 visibility 변경 감지
    setupVisibilityListener();
  }

  function setupPageShowListener() {
    // pageshow 이벤트: bfcache에서 페이지가 복원될 때 발생
    window.addEventListener('pageshow', function(event) {
      if (event.persisted) {
        // bfcache에서 복원됨 (뒤로가기/앞으로가기)
        refreshTimer();
      }
    });
  }

  function setupVisibilityListener() {
    // visibilitychange 이벤트: 탭이 다시 보이게 될 때
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        refreshTimer();
      }
    });
  }

  function refreshTimer() {
    // 타이머 상태를 다시 확인하고 업데이트
    chrome.storage.local.get([STORAGE_KEY], function(result) {
      const lastCommentTime = result[STORAGE_KEY];

      if (lastCommentTime) {
        const now = Date.now();
        const elapsed = Math.floor((now - lastCommentTime) / 1000);
        const remaining = COOLDOWN_TIME - elapsed;

        if (remaining > 0) {
          // 쿨다운 진행 중 - 기존 interval 제거 후 재시작
          if (cooldownInterval) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
          }
          startCooldown(remaining);
        } else {
          // 쿨다운 완료 - 준비 상태로
          if (cooldownInterval) {
            clearInterval(cooldownInterval);
            cooldownInterval = null;
          }
          chrome.storage.local.remove(STORAGE_KEY);
          updateTimerDisplay(0);
        }
      } else {
        // 쿨다운 없음
        updateTimerDisplay(0);
      }
    });
  }


  function createTimerUI() {
    // 타이머 엘리먼트 생성
    timerElement = document.createElement('div');
    timerElement.id = 'enterjoy-cooldown-timer';
    timerElement.className = 'enterjoy-timer-visible';
    timerElement.innerHTML = `
      <div class="enterjoy-timer-content">
        <div class="enterjoy-timer-icon">💬</div>
        <div class="enterjoy-timer-text">
          <span class="enterjoy-timer-label">다음 댓글까지</span>
          <span class="enterjoy-timer-countdown" id="enterjoy-countdown">00:00</span>
        </div>
      </div>
    `;

    // body가 준비될 때까지 대기
    if (document.body) {
      document.body.appendChild(timerElement);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(timerElement);
      });
    }
  }

  function createPointTimerUI() {
    // 포인트 타이머 엘리먼트 생성
    pointTimerElement = document.createElement('div');
    pointTimerElement.id = 'enterjoy-point-timer';
    pointTimerElement.className = 'enterjoy-timer-visible';
    pointTimerElement.innerHTML = `
      <div class="enterjoy-timer-content enterjoy-point-timer-content">
        <div class="enterjoy-timer-icon">🎁</div>
        <div class="enterjoy-timer-text">
          <span class="enterjoy-timer-label">성좌님 출현까지</span>
          <span class="enterjoy-timer-countdown" id="enterjoy-point-countdown">00:00</span>
        </div>
      </div>
    `;

    // body가 준비될 때까지 대기
    if (document.body) {
      document.body.appendChild(pointTimerElement);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(pointTimerElement);
      });
    }
  }

  function createAttendanceTimerUI() {

    // 출석체크 타이머 엘리먼트 생성
    attendanceTimerElement = document.createElement('div');
    attendanceTimerElement.id = 'enterjoy-attendance-timer';
    attendanceTimerElement.className = 'enterjoy-timer-visible';
    attendanceTimerElement.innerHTML = `
      <div class="enterjoy-timer-content enterjoy-attendance-timer-content">
        <div class="enterjoy-timer-icon">💰</div>
        <div class="enterjoy-timer-text">
          <span class="enterjoy-timer-label">무료포인트 수령까지</span>
          <span class="enterjoy-timer-countdown" id="enterjoy-attendance-countdown">클릭하여 확인</span>
        </div>
      </div>
    `;

    // 클릭 이벤트 추가 (capture phase에서 처리하여 확실히 동작하도록)
    attendanceTimerElement.addEventListener('click', function(e) {
      // 클릭 가능한 상태인지 확인
      if (attendanceTimerElement.classList.contains('enterjoy-attendance-timer-clickable')) {
        console.log('출석체크 타이머 클릭 - 포인트 페이지로 이동');
        e.preventDefault();
        e.stopPropagation();
        window.location.href = 'https://enterjoy.day/bbs/board.php?bo_table=point';
      }
    }, true);

    // body가 준비될 때까지 대기
    if (document.body) {
      document.body.appendChild(attendanceTimerElement);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(attendanceTimerElement);
      });
    }
  }

  function checkCooldownStatus() {
    chrome.storage.local.get([STORAGE_KEY], function(result) {
      const lastCommentTime = result[STORAGE_KEY];

      if (lastCommentTime) {
        const now = Date.now();
        const elapsed = Math.floor((now - lastCommentTime) / 1000);
        const remaining = COOLDOWN_TIME - elapsed;

        if (remaining > 0) {
          // 쿨다운 진행 중 - 타이머 시작
          startCooldown(remaining);
        } else {
          // 쿨다운 완료됨 - 스토리지 정리하고 준비 상태 표시
          chrome.storage.local.remove(STORAGE_KEY);
          updateTimerDisplay(0);
        }
      } else {
        // 쿨다운 없음 - 준비 상태 표시
        updateTimerDisplay(0);
      }
    });
  }

  function startCooldown(remainingSeconds) {
    // 기존 타이머가 있으면 제거
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
    }

    let timeLeft = remainingSeconds;

    // 타이머 업데이트
    updateTimerDisplay(timeLeft);

    // 1초마다 업데이트
    cooldownInterval = setInterval(() => {
      timeLeft--;

      if (timeLeft <= 0) {
        clearInterval(cooldownInterval);
        cooldownInterval = null;

        // 쿨다운 완료 - 타이머를 숨기지 않고 준비 상태로 표시
        updateTimerDisplay(0);
        notifyReady();

        // 스토리지에서 마지막 댓글 시간 제거
        chrome.storage.local.remove(STORAGE_KEY);
      } else {
        updateTimerDisplay(timeLeft);
      }
    }, 1000);
  }

  function updateTimerDisplay(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const countdownElement = document.getElementById('enterjoy-countdown');
    if (countdownElement) {
      if (seconds === 0) {
        countdownElement.textContent = '준비됨';
      } else {
        countdownElement.textContent = display;
      }
    }

    // 5초 이하일 때 경고 표시
    if (seconds <= 5 && seconds > 0) {
      timerElement?.classList.add('enterjoy-timer-warning');
      timerElement?.classList.remove('enterjoy-timer-ready');
    } else if (seconds === 0) {
      timerElement?.classList.remove('enterjoy-timer-warning');
      timerElement?.classList.add('enterjoy-timer-ready');
    } else {
      timerElement?.classList.remove('enterjoy-timer-warning', 'enterjoy-timer-ready');
    }
  }

  function showTimer() {
    if (timerElement) {
      timerElement.classList.remove('enterjoy-timer-hidden');
      timerElement.classList.add('enterjoy-timer-visible');
    }
  }

  function hideTimer() {
    if (timerElement) {
      timerElement.classList.remove('enterjoy-timer-visible');
      timerElement.classList.add('enterjoy-timer-hidden');
    }
  }

  // 포인트 타이머 함수들
  function startPointTimer() {
    updatePointTimer(); // 즉시 업데이트

    // 1초마다 업데이트
    pointTimerInterval = setInterval(() => {
      updatePointTimer();
    }, 1000);
  }

  function calculateTimeToNextPoint() {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();

    let targetMinute;
    if (currentMinute < 30) {
      // 다음 목표는 30분
      targetMinute = 30;
    } else {
      // 다음 목표는 다음 시간의 0분
      targetMinute = 60;
    }

    const minutesRemaining = targetMinute - currentMinute;
    const secondsRemaining = 60 - currentSecond;

    // 총 남은 초 계산
    let totalSeconds = minutesRemaining * 60 - (60 - secondsRemaining);
    if (totalSeconds <= 0) {
      totalSeconds = 0;
    }

    return totalSeconds;
  }

  function updatePointTimer() {
    const remainingSeconds = calculateTimeToNextPoint();
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const countdownElement = document.getElementById('enterjoy-point-countdown');
    if (countdownElement) {
      countdownElement.textContent = display;
    }

    // 포인트 수집 시간이 되었을 때
    if (remainingSeconds === 0) {
      showPointReadyNotification();
    }

    // 10초 이하일 때 경고 색상
    if (remainingSeconds <= 10 && remainingSeconds > 0) {
      pointTimerElement?.classList.add('enterjoy-point-timer-warning');
    } else if (remainingSeconds === 0) {
      pointTimerElement?.classList.add('enterjoy-point-timer-ready');
      pointTimerElement?.classList.remove('enterjoy-point-timer-warning');
    } else {
      pointTimerElement?.classList.remove('enterjoy-point-timer-warning', 'enterjoy-point-timer-ready');
    }
  }

  function showPointReadyNotification() {
    // 알림 표시
    showNotification('포인트 수집 가능!', '지금 포인트 아이콘을 클릭하세요!');

    // 짧은 알림 배너 표시
    const banner = document.createElement('div');
    banner.className = 'enterjoy-ready-banner enterjoy-point-banner';
    banner.textContent = '🎁 포인트 수집 가능!';
    document.body.appendChild(banner);

    setTimeout(() => {
      banner.classList.add('enterjoy-banner-show');
    }, 10);

    setTimeout(() => {
      banner.classList.remove('enterjoy-banner-show');
      setTimeout(() => banner.remove(), 300);
    }, 5000); // 5초간 표시
  }

  // 출석체크 타이머 함수들
  function startAttendanceTimer() {
    updateAttendanceTimer(); // 즉시 업데이트

    // 1초마다 업데이트
    attendanceTimerInterval = setInterval(() => {
      updateAttendanceTimer();
    }, 1000);
  }

  function updateAttendanceTimer() {
    chrome.storage.local.get([ATTENDANCE_TARGET_KEY], function(result) {
      const targetTime = result[ATTENDANCE_TARGET_KEY];

      if (!targetTime) {
        // 목표 시간 없음 - 링크 클릭 필요
        displayAttendanceTime(0, false, true);
        return;
      }

      const now = Date.now();
      const remaining = Math.max(0, Math.floor((targetTime - now) / 1000));

      if (remaining > 0) {
        // 아직 수령 가능 시간이 안 됨
        displayAttendanceTime(remaining, false, false);
      } else {
        // 수령 가능 시간 도달
        displayAttendanceTime(0, true, false);
      }
    });
  }

  function displayAttendanceTime(seconds, isReady, needsClick) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const countdownElement = document.getElementById('enterjoy-attendance-countdown');
    if (countdownElement) {
      if (needsClick) {
        countdownElement.textContent = '클릭하여 확인';
      } else if (isReady) {
        countdownElement.textContent = '포인트 수령 (클릭)';
      } else {
        countdownElement.textContent = display;
      }
    }

    // 상태에 따른 스타일 변경
    if (needsClick) {
      attendanceTimerElement?.classList.add('enterjoy-attendance-timer-info', 'enterjoy-attendance-timer-clickable');
      attendanceTimerElement?.classList.remove('enterjoy-attendance-timer-warning', 'enterjoy-attendance-timer-ready');
    } else if (isReady) {
      attendanceTimerElement?.classList.add('enterjoy-attendance-timer-ready', 'enterjoy-attendance-timer-clickable');
      attendanceTimerElement?.classList.remove('enterjoy-attendance-timer-warning', 'enterjoy-attendance-timer-info');
      // 준비됨 알림 (한 번만)
      if (!attendanceTimerElement.dataset.notified) {
        attendanceTimerElement.dataset.notified = 'true';
        showAttendanceReadyNotification();
      }
    } else if (seconds <= 3600) {
      // 1시간 이하일 때 경고
      attendanceTimerElement?.classList.add('enterjoy-attendance-timer-warning');
      attendanceTimerElement?.classList.remove('enterjoy-attendance-timer-ready', 'enterjoy-attendance-timer-info', 'enterjoy-attendance-timer-clickable');
      // notified 플래그 리셋
      if (attendanceTimerElement) {
        delete attendanceTimerElement.dataset.notified;
      }
    } else {
      attendanceTimerElement?.classList.remove('enterjoy-attendance-timer-warning', 'enterjoy-attendance-timer-ready', 'enterjoy-attendance-timer-info', 'enterjoy-attendance-timer-clickable');
      // notified 플래그 리셋
      if (attendanceTimerElement) {
        delete attendanceTimerElement.dataset.notified;
      }
    }
  }

  function showAttendanceReadyNotification() {
    // 알림 표시
    showNotification('출석체크 가능!', '24시간이 지났습니다. 출석체크 하세요!');

    // 짧은 알림 배너 표시
    const banner = document.createElement('div');
    banner.className = 'enterjoy-ready-banner enterjoy-attendance-banner';
    banner.textContent = '📅 출석체크 가능!';
    document.body.appendChild(banner);

    setTimeout(() => {
      banner.classList.add('enterjoy-banner-show');
    }, 10);

    setTimeout(() => {
      banner.classList.remove('enterjoy-banner-show');
      setTimeout(() => banner.remove(), 300);
    }, 5000);
  }

  function observeAttendanceLink() {
    // 링크 클릭 감지
    document.addEventListener('click', function(e) {
      const target = e.target.closest('a');
      if (target && target.href) {
        if (target.href.includes('bo_table=point') && target.href.includes('wr_id=5')) {
          // 팝업/모달 감지 (한 번만)
          setTimeout(() => detectPopupModal(), 500);
        }
      }
    }, true);

    // 현재 페이지가 출석체크 페이지인지 확인
    if (window.location.href.includes('bo_table=point') && window.location.href.includes('wr_id=5')) {
      // 페이지 로드 시 타이머 시작 (포인트 획득 확인)
      setTimeout(() => {
        checkAttendanceSuccess();
      }, 2000);
    }

    // DOM 변경 감지 (모달/팝업 추가 감지)
    observeModalInsertion();
  }

  function detectPopupModal() {
    // 가능한 모달/팝업 선택자들
    const selectors = [
      '.swal-modal', '.swal2-popup',
      '.modal', '.modal-dialog', '.modal-content',
      '[role="dialog"]', '[role="alertdialog"]',
      '.alert', '.alert-box',
      '.popup', '.dialog',
    ];

    // 표준 선택자로 검색
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (let element of elements) {
        if (element.offsetParent !== null) {
          const text = element.innerText || element.textContent;
          if (text && (text.includes('링크 보너스') || text.includes('다음 가능'))) {
            extractTimeFromPopup(text);
            return;
          }
        }
      }
    }

    // 전체 visible 요소 검색
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
      if (el.offsetParent !== null && el.offsetHeight > 0 && el.offsetWidth > 0) {
        const text = el.innerText || el.textContent || '';
        if (text.includes('다음 가능') && text.includes('링크 보너스')) {
          extractTimeFromPopup(text);
          return;
        }
      }
    }
  }

  function observeModalInsertion() {
    let lastProcessedText = '';

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const text = node.innerText || node.textContent || '';

            // "다음 가능" 포함하고 이전에 처리하지 않은 텍스트인 경우
            if (text.includes('다음 가능') && text !== lastProcessedText) {
              lastProcessedText = text;
              extractTimeFromPopup(text);
              return;
            }

            // 하위 요소에서 찾기
            if (node.querySelectorAll) {
              const descendants = node.querySelectorAll('*');
              for (let desc of descendants) {
                const descText = desc.innerText || desc.textContent || '';
                if (descText.includes('다음 가능') && descText !== lastProcessedText) {
                  lastProcessedText = descText;
                  extractTimeFromPopup(descText);
                  return;
                }
              }
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function extractTimeFromPopup(message) {
    // 패턴 0: "다음 가능: YYYY-MM-DD HH:MM:SS" 형식
    let match = message.match(/다음\s*가능[:\s]*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const day = parseInt(match[3]);
      const hour = parseInt(match[4]);
      const minute = parseInt(match[5]);
      const second = parseInt(match[6]);

      const targetDate = new Date(year, month, day, hour, minute, second);
      const targetTime = targetDate.getTime();

      // 목표 시간을 저장
      chrome.storage.local.set({ [ATTENDANCE_TARGET_KEY]: targetTime }, function() {
        updateAttendanceTimer();
      });
      return;
    }

    // 패턴 1: "XX시간 XX분 XX초"
    match = message.match(/(\d+)시간\s*(\d+)분\s*(\d+)초/);
    if (match) {
      const totalSeconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
      const targetTime = Date.now() + (totalSeconds * 1000);
      chrome.storage.local.set({ [ATTENDANCE_TARGET_KEY]: targetTime }, function() {
        updateAttendanceTimer();
      });
      return;
    }

    // 패턴 2: "XX시간 XX분"
    match = message.match(/(\d+)시간\s*(\d+)분/);
    if (match) {
      const totalSeconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60;
      const targetTime = Date.now() + (totalSeconds * 1000);
      chrome.storage.local.set({ [ATTENDANCE_TARGET_KEY]: targetTime }, function() {
        updateAttendanceTimer();
      });
      return;
    }

    // 패턴 3: "XX분 XX초"
    match = message.match(/(\d+)분\s*(\d+)초/);
    if (match) {
      const totalSeconds = parseInt(match[1]) * 60 + parseInt(match[2]);
      const targetTime = Date.now() + (totalSeconds * 1000);
      chrome.storage.local.set({ [ATTENDANCE_TARGET_KEY]: targetTime }, function() {
        updateAttendanceTimer();
      });
      return;
    }

    // 패턴 4: "XX시간"
    match = message.match(/(\d+)시간/);
    if (match) {
      const totalSeconds = parseInt(match[1]) * 3600;
      const targetTime = Date.now() + (totalSeconds * 1000);
      chrome.storage.local.set({ [ATTENDANCE_TARGET_KEY]: targetTime }, function() {
        updateAttendanceTimer();
      });
      return;
    }

    // 포인트 획득 성공 메시지 확인
    if (!message.includes('이미') && !message.includes('수령했습니다')) {
      if (message.includes('포인트') && (message.includes('적립') || message.includes('감사') || message.includes('획득'))) {
        // 포인트를 받았으므로 24시간 후를 목표 시간으로 설정
        const targetTime = Date.now() + (ATTENDANCE_TIME * 1000);
        chrome.storage.local.set({
          [ATTENDANCE_KEY]: Date.now(),
          [ATTENDANCE_TARGET_KEY]: targetTime
        }, function() {
          updateAttendanceTimer();
        });
      }
    }
  }


  function checkAttendanceSuccess() {
    // 기존에 저장된 시간 확인
    chrome.storage.local.get([ATTENDANCE_KEY], function(result) {
      const existingLastTime = result[ATTENDANCE_KEY];

      // 포인트 획득 성공 메시지가 있는지 확인
      const bodyText = document.body.innerText;
      if (bodyText.includes('포인트') && (bodyText.includes('적립') || bodyText.includes('감사') || bodyText.includes('획득'))) {
        // 최근 10초 이내에 이미 기록되었다면 중복 방지
        if (existingLastTime && (Date.now() - existingLastTime < 10000)) {
          return;
        }

        // 포인트를 받았으므로 24시간 타이머 초기화
        const now = Date.now();
        const targetTime = now + (ATTENDANCE_TIME * 1000);
        chrome.storage.local.set({
          [ATTENDANCE_KEY]: now,
          [ATTENDANCE_TARGET_KEY]: targetTime
        }, function() {
          console.log('포인트 수령 완료 - 24시간 타이머 초기화');
          updateAttendanceTimer();
        });
      }
    });
  }

  function notifyReady() {
    // 알림 표시
    showNotification('댓글 작성 가능!', '이제 새로운 댓글을 작성할 수 있습니다.');

    // 짧은 알림 배너 표시
    const banner = document.createElement('div');
    banner.className = 'enterjoy-ready-banner';
    banner.textContent = '✅ 댓글 작성 가능';
    document.body.appendChild(banner);

    setTimeout(() => {
      banner.classList.add('enterjoy-banner-show');
    }, 10);

    setTimeout(() => {
      banner.classList.remove('enterjoy-banner-show');
      setTimeout(() => banner.remove(), 300);
    }, 3000);
  }

  function showNotification(title, message) {
    // 백그라운드 스크립트에 알림 요청
    chrome.runtime.sendMessage({
      action: 'notify',
      title: title,
      message: message
    });
  }

  function observeCommentForms() {
    // 댓글 제출 버튼 감지 (일반적인 선택자들)
    const possibleSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.comment-submit',
      '.submit-button',
      '[class*="submit"]',
      '[class*="comment"]'
    ];

    // 주기적으로 댓글 폼 확인
    const checkInterval = setInterval(() => {
      possibleSelectors.forEach(selector => {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(button => {
          if (!button.dataset.enterjoyListener) {
            attachCommentListener(button);
            button.dataset.enterjoyListener = 'true';
          }
        });
      });

      // 폼 제출 이벤트 감지 제거 (버튼만 감지)
    }, 1000);

    // 10초 후 중지 (초기 로드 완료 후)
    setTimeout(() => clearInterval(checkInterval), 10000);

    // MutationObserver로 동적 요소 감지
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element 노드
            possibleSelectors.forEach(selector => {
              if (node.matches && node.matches(selector)) {
                attachCommentListener(node);
              }
              const buttons = node.querySelectorAll?.(selector);
              buttons?.forEach(button => {
                if (!button.dataset.enterjoyListener) {
                  attachCommentListener(button);
                  button.dataset.enterjoyListener = 'true';
                }
              });
            });

            // 폼과 입력 필드 감지 제거 - 버튼에서만 엔터키 감지
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function attachCommentListener(element) {
    // 마우스 클릭 이벤트
    element.addEventListener('click', function() {
      handleCommentSubmission(element);
    });

    // 키보드 엔터키 이벤트 (버튼에 포커스가 있을 때만)
    element.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        handleCommentSubmission(element);
      }
    });

    // keypress도 추가 (브라우저 호환성)
    element.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        // keydown에서 이미 처리하므로 중복 실행 방지 로직이 작동
        handleCommentSubmission(element);
      }
    });
  }

  function handleCommentSubmission(element) {
    // 중복 실행 방지 (500ms 이내 중복 호출 무시)
    const now = Date.now();
    if (now - lastSubmissionCheck < 500) {
      return;
    }
    lastSubmissionCheck = now;

    // 댓글 폼이 있는지 확인
    const form = element.closest('form') || (element.tagName === 'FORM' ? element : null);
    if (!form) {
      return;
    }

    // textarea만 댓글 입력으로 인식 (검색창 제외)
    const commentInput = form.querySelector('textarea');
    if (!commentInput) {
      // textarea가 없으면 댓글 폼이 아니므로 타이머 시작 안 함
      return;
    }

    if (!commentInput.value.trim()) {
      return;
    }

    // 현재 쿨다운 중인지 확인
    chrome.storage.local.get([STORAGE_KEY], function(result) {
      const lastCommentTime = result[STORAGE_KEY];
      const checkTime = Date.now();

      if (lastCommentTime) {
        const elapsed = Math.floor((checkTime - lastCommentTime) / 1000);
        const remaining = COOLDOWN_TIME - elapsed;

        if (remaining > 0) {
          // 아직 쿨다운 중
          return;
        }
      }

      // 새로운 댓글 시간 저장
      console.log('댓글 작성 감지 - 타이머 시작');
      chrome.storage.local.set({ [STORAGE_KEY]: checkTime }, function() {
        startCooldown(COOLDOWN_TIME);
      });
    });
  }

  // 메시지 리스너
  chrome.runtime.onMessage.addListener(function(request, _sender, sendResponse) {
    if (request.action === 'getCooldownStatus') {
      chrome.storage.local.get([STORAGE_KEY], function(result) {
        const lastCommentTime = result[STORAGE_KEY];
        let status = { inCooldown: false, remaining: 0 };

        if (lastCommentTime) {
          const now = Date.now();
          const elapsed = Math.floor((now - lastCommentTime) / 1000);
          const remaining = COOLDOWN_TIME - elapsed;

          if (remaining > 0) {
            status = { inCooldown: true, remaining: remaining };
          }
        }

        sendResponse({ success: true, status: status });
      });
      return true;
    }

    if (request.action === 'resetCooldown') {
      chrome.storage.local.remove(STORAGE_KEY, function() {
        if (cooldownInterval) {
          clearInterval(cooldownInterval);
          cooldownInterval = null;
        }
        hideTimer();
        sendResponse({ success: true });
      });
      return true;
    }

    if (request.action === 'startTestTimer') {
      // 테스트용 타이머 시작 (5초)
      const testDuration = request.duration || 5;

      // 스토리지에 시작 시간 저장
      // 실제 시간에서 (COOLDOWN_TIME - testDuration)초 전으로 설정
      const now = Date.now();
      const adjustedTime = now - ((COOLDOWN_TIME - testDuration) * 1000);
      chrome.storage.local.set({ [STORAGE_KEY]: adjustedTime }, function() {
        startCooldown(testDuration);
      });

      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'updateEnabled') {
      // 활성화 상태 업데이트
      isExtensionEnabled = request.enabled;

      if (isExtensionEnabled) {
        // 활성화: 타이머 표시
        if (!timerElement) {
          createTimerUI();
        }
        checkCooldownStatus();
      } else {
        // 비활성화: 타이머 숨김
        if (cooldownInterval) {
          clearInterval(cooldownInterval);
          cooldownInterval = null;
        }
        if (timerElement) {
          timerElement.style.display = 'none';
        }
      }

      sendResponse({ success: true });
      return true;
    }

    return true;
  });

})();
