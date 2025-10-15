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
  let pointInterval = 30; // 기본값: 30분 간격

  // 출석체크 타이머 관리
  const ATTENDANCE_KEY = 'enterjoy_last_attendance_time';
  const ATTENDANCE_TARGET_KEY = 'enterjoy_attendance_target_time'; // 다음 수령 가능 시간
  const ATTENDANCE_TIME = 24 * 60 * 60; // 24시간 (초)
  let attendanceTimerInterval = null;
  let attendanceTimerElement = null;

  // 드래그 앤 드롭 관리
  const POSITION_STORAGE_KEY = 'enterjoy_timer_positions';
  let isDragging = false;
  let currentDragElement = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let elementStartX = 0;
  let elementStartY = 0;
  let isGroupDrag = false;
  // 그룹 드래그 시 각 타이머의 초기 위치 저장
  let groupDragStartPositions = {};

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
  chrome.storage.sync.get(['enabled', 'pointInterval', 'theme', 'timerMode'], function(result) {
    isExtensionEnabled = result.enabled !== false; // undefined일 경우 true로 처리
    pointInterval = result.pointInterval || 30; // 기본값: 30분
    const theme = result.theme || 'color'; // 기본값: color
    const timerMode = result.timerMode || 'normal'; // 기본값: normal

    console.log('[EnterJoy Init] 🚀 확장프로그램 초기화');
    console.log('[EnterJoy Init] 활성화 상태:', isExtensionEnabled);
    console.log('[EnterJoy Init] 성좌 출현시간:', pointInterval, '분');
    console.log('[EnterJoy Init] 테마:', theme);
    console.log('[EnterJoy Init] 모드:', timerMode);

    // 테마 적용
    applyTheme(theme);

    // 타이머 모드 적용 (body 클래스만 적용, 라벨은 생성 시 결정)
    if (timerMode === 'compact') {
      document.body.classList.add('enterjoy-mode-compact');
    } else {
      document.body.classList.add('enterjoy-mode-normal');
    }

    if (!isExtensionEnabled) {
      console.log('[EnterJoy Init] ⚠️ 확장프로그램이 비활성화되어 있습니다.');
      return;
    }

    initializeExtension(timerMode);
  });

  function applyTheme(theme) {
    // 기존 테마 클래스 제거
    document.body.classList.remove('enterjoy-theme-color', 'enterjoy-theme-black');

    // 새 테마 적용
    if (theme === 'black') {
      document.body.classList.add('enterjoy-theme-black');
    } else {
      document.body.classList.add('enterjoy-theme-color');
    }
  }

  function applyTimerMode(mode) {
    // 기존 모드 클래스 제거
    document.body.classList.remove('enterjoy-mode-normal', 'enterjoy-mode-compact');

    // 새 모드 적용
    if (mode === 'compact') {
      document.body.classList.add('enterjoy-mode-compact');
      // 컴팩트 모드에서 라벨 변경
      updateTimerLabels(true);
    } else {
      document.body.classList.add('enterjoy-mode-normal');
      // 일반 모드에서 라벨 복원
      updateTimerLabels(false);
    }
  }

  function updateTimerLabels(isCompact) {
    // 댓글 타이머 라벨
    const commentLabel = document.querySelector('#enterjoy-cooldown-timer .enterjoy-timer-label');
    if (commentLabel) {
      commentLabel.textContent = isCompact ? '다음 댓글' : '다음 댓글까지';
    }

    // 포인트 타이머 라벨
    const pointLabel = document.querySelector('#enterjoy-point-timer .enterjoy-timer-label');
    if (pointLabel) {
      pointLabel.textContent = isCompact ? '성좌 출현' : '성좌님 출현까지';
    }

    // 출석체크 타이머 라벨
    const attendanceLabel = document.querySelector('#enterjoy-attendance-timer .enterjoy-timer-label');
    if (attendanceLabel) {
      attendanceLabel.textContent = isCompact ? '무료포 수령' : '무료포인트 수령까지';
    }
  }

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

  function initializeExtension(timerMode) {
    const isCompact = timerMode === 'compact';

    // 타이머 UI 생성 (모드에 따라)
    createTimerUI(isCompact);

    // 포인트 타이머 UI 생성 (모드에 따라)
    createPointTimerUI(isCompact);

    // 출석체크 타이머 UI 생성 (모드에 따라)
    createAttendanceTimerUI(isCompact);

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

  function createTimerUI(isCompact) {
    const label = isCompact ? '다음 댓글' : '다음 댓글까지';

    // 타이머 엘리먼트 생성
    timerElement = document.createElement('div');
    timerElement.id = 'enterjoy-cooldown-timer';
    timerElement.className = 'enterjoy-timer-visible';
    timerElement.dataset.timerType = 'comment';
    timerElement.innerHTML = `
      <div class="enterjoy-timer-content">
        <div class="enterjoy-timer-icon">💬</div>
        <div class="enterjoy-timer-text">
          <span class="enterjoy-timer-label">${label}</span>
          <span class="enterjoy-timer-countdown" id="enterjoy-countdown">00:00</span>
        </div>
      </div>
    `;

    // body가 준비될 때까지 대기
    if (document.body) {
      document.body.appendChild(timerElement);
      // 저장된 위치 복원 및 드래그 이벤트 추가
      restoreTimerPosition(timerElement);
      attachDragListeners(timerElement);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(timerElement);
        restoreTimerPosition(timerElement);
        attachDragListeners(timerElement);
      });
    }
  }

  function createPointTimerUI(isCompact) {
    const label = isCompact ? '성좌 출현' : '성좌님 출현까지';

    // 포인트 타이머 엘리먼트 생성
    pointTimerElement = document.createElement('div');
    pointTimerElement.id = 'enterjoy-point-timer';
    pointTimerElement.className = 'enterjoy-timer-visible';
    pointTimerElement.dataset.timerType = 'point';
    pointTimerElement.innerHTML = `
      <div class="enterjoy-timer-content enterjoy-point-timer-content">
        <div class="enterjoy-timer-icon">🎁</div>
        <div class="enterjoy-timer-text">
          <span class="enterjoy-timer-label">${label}</span>
          <span class="enterjoy-timer-countdown" id="enterjoy-point-countdown">00:00</span>
        </div>
      </div>
    `;

    // body가 준비될 때까지 대기
    if (document.body) {
      document.body.appendChild(pointTimerElement);
      restoreTimerPosition(pointTimerElement);
      attachDragListeners(pointTimerElement);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(pointTimerElement);
        restoreTimerPosition(pointTimerElement);
        attachDragListeners(pointTimerElement);
      });
    }
  }

  function createAttendanceTimerUI(isCompact) {
    const label = isCompact ? '무료포 수령' : '무료포인트 수령까지';

    // 출석체크 타이머 엘리먼트 생성
    attendanceTimerElement = document.createElement('div');
    attendanceTimerElement.id = 'enterjoy-attendance-timer';
    attendanceTimerElement.className = 'enterjoy-timer-visible';
    attendanceTimerElement.dataset.timerType = 'attendance';
    attendanceTimerElement.innerHTML = `
      <div class="enterjoy-timer-content enterjoy-attendance-timer-content">
        <div class="enterjoy-timer-icon">💰</div>
        <div class="enterjoy-timer-text">
          <span class="enterjoy-timer-label">${label}</span>
          <span class="enterjoy-timer-countdown" id="enterjoy-attendance-countdown">클릭하여 확인</span>
        </div>
      </div>
    `;

    // 클릭 이벤트 추가 (capture phase에서 처리하여 확실히 동작하도록)
    attendanceTimerElement.addEventListener('click', function(e) {
      // 드래그 중이면 클릭 무시
      if (isDragging) {
        return;
      }
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
      restoreTimerPosition(attendanceTimerElement);
      attachDragListeners(attendanceTimerElement);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(attendanceTimerElement);
        restoreTimerPosition(attendanceTimerElement);
        attachDragListeners(attendanceTimerElement);
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

    if (pointInterval === 10) {
      // 10분 간격: 0, 10, 20, 30, 40, 50
      targetMinute = Math.ceil((currentMinute + 1) / 10) * 10;
      if (targetMinute > 50) {
        targetMinute = 60; // 다음 시간의 0분
      }
    } else if (pointInterval === 20) {
      // 20분 간격: 0, 20, 40
      targetMinute = Math.ceil((currentMinute + 1) / 20) * 20;
      if (targetMinute > 40) {
        targetMinute = 60; // 다음 시간의 0분
      }
    } else {
      // 30분 간격: 0, 30 (기본값)
      if (currentMinute < 30) {
        targetMinute = 30;
      } else {
        targetMinute = 60; // 다음 시간의 0분
      }
    }

    const minutesRemaining = targetMinute - currentMinute;
    const secondsRemaining = 60 - currentSecond;

    // 총 남은 초 계산
    let totalSeconds = minutesRemaining * 60 - (60 - secondsRemaining);

    if (totalSeconds < 0) {
      totalSeconds = 0;
    }

    // 10초 이하일 때만 디버그 로그 출력
    if (totalSeconds <= 10) {
      console.log('[EnterJoy Debug] 현재:', currentMinute + '분', currentSecond + '초', '/ 목표:', targetMinute + '분 / 남은 초:', totalSeconds, '/ minutesRemaining:', minutesRemaining, '/ secondsRemaining:', secondsRemaining);
    }

    return totalSeconds;
  }

  function updatePointTimer() {
    const remainingSeconds = calculateTimeToNextPoint();
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // 디버깅: 10초 이하일 때 로그 출력
    if (remainingSeconds <= 10) {
      console.log('[EnterJoy Timer] 남은 시간:', remainingSeconds, '초');
      console.log('[EnterJoy Timer] 현재 간격 설정:', pointInterval, '분');
    }

    const countdownElement = document.getElementById('enterjoy-point-countdown');
    if (countdownElement) {
      countdownElement.textContent = display;
    }

    // 포인트 수집 시간이 되었을 때
    if (remainingSeconds === 0) {
      console.log('[EnterJoy Timer] ⏰ 타이머 0초 도달! - showPointReadyNotification 호출');
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

  // ========== 드래그 앤 드롭 기능 ==========

  // 타이머 위치 복원
  function restoreTimerPosition(element) {
    chrome.storage.local.get([POSITION_STORAGE_KEY], function(result) {
      const positions = result[POSITION_STORAGE_KEY];
      if (positions && positions[element.id]) {
        const pos = positions[element.id];
        element.style.left = pos.left;
        element.style.top = pos.top;
        element.style.right = 'auto';
        element.style.bottom = 'auto';
      }
    });
  }

  // 타이머 위치 저장
  function saveTimerPosition(element) {
    chrome.storage.local.get([POSITION_STORAGE_KEY], function(result) {
      const positions = result[POSITION_STORAGE_KEY] || {};
      const rect = element.getBoundingClientRect();

      positions[element.id] = {
        left: element.style.left,
        top: element.style.top
      };

      chrome.storage.local.set({ [POSITION_STORAGE_KEY]: positions });
    });
  }

  // 모든 타이머 위치 초기화
  function resetAllTimerPositions() {
    chrome.storage.local.remove(POSITION_STORAGE_KEY, function() {
      // 각 타이머를 기본 위치로 복원
      if (timerElement) {
        timerElement.style.left = 'auto';
        timerElement.style.top = 'auto';
        timerElement.style.right = '';
        timerElement.style.bottom = '';
      }
      if (pointTimerElement) {
        pointTimerElement.style.left = 'auto';
        pointTimerElement.style.top = 'auto';
        pointTimerElement.style.right = '';
        pointTimerElement.style.bottom = '';
      }
      if (attendanceTimerElement) {
        attendanceTimerElement.style.left = 'auto';
        attendanceTimerElement.style.top = 'auto';
        attendanceTimerElement.style.right = '';
        attendanceTimerElement.style.bottom = '';
      }
    });
  }

  // 드래그 이벤트 리스너 추가
  function attachDragListeners(element) {
    element.style.cursor = 'move';

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
  }

  function handleMouseDown(e) {
    // 드래그 시작
    const element = e.currentTarget;

    // Ctrl 또는 Shift 키가 눌렸는지 확인 (그룹 드래그)
    isGroupDrag = e.ctrlKey || e.shiftKey;

    isDragging = true;
    currentDragElement = element;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = element.getBoundingClientRect();
    elementStartX = rect.left;
    elementStartY = rect.top;

    // 드래그 중 스타일 추가
    element.classList.add('enterjoy-timer-dragging');

    if (isGroupDrag) {
      // 그룹 드래그 시 모든 타이머의 초기 위치 저장
      groupDragStartPositions = {};

      if (timerElement) {
        const timerRect = timerElement.getBoundingClientRect();
        groupDragStartPositions['enterjoy-cooldown-timer'] = {
          left: timerRect.left,
          top: timerRect.top
        };
        timerElement.classList.add('enterjoy-timer-dragging');
      }

      if (pointTimerElement) {
        const pointRect = pointTimerElement.getBoundingClientRect();
        groupDragStartPositions['enterjoy-point-timer'] = {
          left: pointRect.left,
          top: pointRect.top
        };
        pointTimerElement.classList.add('enterjoy-timer-dragging');
      }

      if (attendanceTimerElement) {
        const attendanceRect = attendanceTimerElement.getBoundingClientRect();
        groupDragStartPositions['enterjoy-attendance-timer'] = {
          left: attendanceRect.left,
          top: attendanceRect.top
        };
        attendanceTimerElement.classList.add('enterjoy-timer-dragging');
      }
    }

    // 전역 이벤트 리스너 추가
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (!isDragging || !currentDragElement) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    if (isGroupDrag) {
      // 그룹 드래그: 모든 타이머 이동
      moveTimer(timerElement, deltaX, deltaY);
      moveTimer(pointTimerElement, deltaX, deltaY);
      moveTimer(attendanceTimerElement, deltaX, deltaY);
    } else {
      // 개별 드래그: 현재 타이머만 이동
      moveTimer(currentDragElement, deltaX, deltaY);
    }

    e.preventDefault();
  }

  function moveTimer(element, deltaX, deltaY) {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    let startX, startY;

    if (element === currentDragElement) {
      // 현재 드래그 중인 엘리먼트
      startX = elementStartX;
      startY = elementStartY;
    } else if (isGroupDrag && groupDragStartPositions[element.id]) {
      // 그룹 드래그: 저장된 초기 위치 사용
      startX = groupDragStartPositions[element.id].left;
      startY = groupDragStartPositions[element.id].top;
    } else {
      // 기본 동작 (개별 드래그 시)
      return;
    }

    let newX = startX + deltaX;
    let newY = startY + deltaY;

    // 화면 경계 제한
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    element.style.left = newX + 'px';
    element.style.top = newY + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }

  function handleMouseUp(e) {
    if (!isDragging) return;

    isDragging = false;

    // 드래그 스타일 제거
    if (currentDragElement) {
      currentDragElement.classList.remove('enterjoy-timer-dragging');
    }
    if (timerElement) timerElement.classList.remove('enterjoy-timer-dragging');
    if (pointTimerElement) pointTimerElement.classList.remove('enterjoy-timer-dragging');
    if (attendanceTimerElement) attendanceTimerElement.classList.remove('enterjoy-timer-dragging');

    // 위치 저장
    if (isGroupDrag) {
      // 그룹 드래그: 모든 타이머 위치 저장
      if (timerElement) saveTimerPosition(timerElement);
      if (pointTimerElement) saveTimerPosition(pointTimerElement);
      if (attendanceTimerElement) saveTimerPosition(attendanceTimerElement);
    } else {
      // 개별 드래그: 현재 타이머만 저장
      if (currentDragElement) saveTimerPosition(currentDragElement);
    }

    // 초기화
    currentDragElement = null;
    isGroupDrag = false;
    groupDragStartPositions = {};

    // 전역 이벤트 리스너 제거
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    e.preventDefault();
  }

  // 터치 이벤트 핸들러 (모바일 지원)
  function handleTouchStart(e) {
    const element = e.currentTarget;
    const touch = e.touches[0];

    // Ctrl/Shift는 터치에서 지원하지 않으므로 개별 드래그만
    isGroupDrag = false;

    isDragging = true;
    currentDragElement = element;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;

    const rect = element.getBoundingClientRect();
    elementStartX = rect.left;
    elementStartY = rect.top;

    element.classList.add('enterjoy-timer-dragging');

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    e.preventDefault();
  }

  function handleTouchMove(e) {
    if (!isDragging || !currentDragElement) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartX;
    const deltaY = touch.clientY - dragStartY;

    moveTimer(currentDragElement, deltaX, deltaY);

    e.preventDefault();
  }

  function handleTouchEnd(e) {
    if (!isDragging) return;

    isDragging = false;

    if (currentDragElement) {
      currentDragElement.classList.remove('enterjoy-timer-dragging');
      saveTimerPosition(currentDragElement);
    }

    currentDragElement = null;

    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);

    e.preventDefault();
  }

  // ========== 드래그 앤 드롭 기능 끝 ==========

  function observeCommentForms() {
    // 댓글 제출 버튼 감지 (일반적인 선택자들)
    const possibleSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.comment-submit',
      '.submit-button',
      '[class*="submit"]'
    ];

    // 주기적으로 댓글 폼 확인
    const checkInterval = setInterval(() => {
      possibleSelectors.forEach(selector => {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(button => {
          // textarea는 제외
          if (button.tagName !== 'TEXTAREA' && !button.dataset.enterjoyListener) {
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
              if (node.matches && node.matches(selector) && node.tagName !== 'TEXTAREA') {
                attachCommentListener(node);
              }
              const buttons = node.querySelectorAll?.(selector);
              buttons?.forEach(button => {
                // textarea는 제외
                if (button.tagName !== 'TEXTAREA' && !button.dataset.enterjoyListener) {
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
    // 마우스 클릭 이벤트 (실제 버튼 클릭만 감지)
    element.addEventListener('click', function(e) {
      // 클릭 대상이 실제 버튼인지 확인 (textarea나 다른 요소가 아닌)
      if (e.target === element || element.contains(e.target)) {
        // 클릭 이벤트만 처리
        handleCommentSubmission(element);
      }
    });

    // 키보드 엔터키 이벤트 (버튼에 포커스가 있을 때만)
    element.addEventListener('keydown', function(e) {
      // 엔터키이고, 현재 포커스가 버튼에 있고, Shift/Ctrl/Alt 키가 눌리지 않은 경우에만
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && document.activeElement === element) {
        e.preventDefault(); // 기본 동작 방지
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
        // 현재 모드 확인
        chrome.storage.sync.get(['timerMode'], function(result) {
          const isCompact = (result.timerMode || 'normal') === 'compact';

          // 활성화: 모든 타이머 표시
          if (!timerElement) {
            createTimerUI(isCompact);
          } else {
            timerElement.style.display = 'flex';
          }

          if (!pointTimerElement) {
            createPointTimerUI(isCompact);
          } else {
            pointTimerElement.style.display = 'flex';
          }

          if (!attendanceTimerElement) {
            createAttendanceTimerUI(isCompact);
          } else {
            attendanceTimerElement.style.display = 'flex';
          }
        });

        // 타이머 상태 확인 및 시작
        checkCooldownStatus();

        if (!pointTimerInterval) {
          startPointTimer();
        }

        if (!attendanceTimerInterval) {
          startAttendanceTimer();
        }
      } else {
        // 비활성화: 모든 타이머 숨김
        if (cooldownInterval) {
          clearInterval(cooldownInterval);
          cooldownInterval = null;
        }
        if (timerElement) {
          timerElement.style.display = 'none';
        }

        if (pointTimerInterval) {
          clearInterval(pointTimerInterval);
          pointTimerInterval = null;
        }
        if (pointTimerElement) {
          pointTimerElement.style.display = 'none';
        }

        if (attendanceTimerInterval) {
          clearInterval(attendanceTimerInterval);
          attendanceTimerInterval = null;
        }
        if (attendanceTimerElement) {
          attendanceTimerElement.style.display = 'none';
        }
      }

      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'updatePointInterval') {
      // 포인트 간격 업데이트
      console.log('[EnterJoy] 🔄 성좌 출현시간 변경:', pointInterval, '분 →', request.interval, '분');
      pointInterval = request.interval;

      // 타이머 즉시 재계산
      updatePointTimer();

      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'updateTheme') {
      // 테마 업데이트
      applyTheme(request.theme);

      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'updateTimerMode') {
      // 타이머 모드 업데이트
      applyTimerMode(request.mode);

      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'resetTimerPositions') {
      // 타이머 위치 초기화
      resetAllTimerPositions();

      sendResponse({ success: true });
      return true;
    }

    return true;
  });

})();
