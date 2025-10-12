# EnterJoy Timer Extension

enterjoy.day를 위한 타이머 확장프로그램입니다.

## 주요 기능

- **댓글 쿨다운 타이머**: 20초 댓글 작성 쿨다운을 시각적으로 표시
- **포인트 수집 타이머**: 30분 간격 포인트 수집 시간 알림
- **무료포인트 수령 타이머**: 24시간 주기 무료포인트 수령 알림 (클릭하여 페이지 이동)
- **실시간 알림**: 각 타이머 완료 시 브라우저 알림 표시
- **자동 시간 감지**: 팝업/모달에서 자동으로 남은 시간 추출

## 프로젝트 구조

```
EnterJoy_Timer/
├── manifest.json           # 확장프로그램 설정 파일
├── popup/                  # 팝업 UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/             # 백그라운드 서비스 워커
│   └── background.js
├── content/                # 콘텐츠 스크립트 (웹 페이지에 주입)
│   ├── content.js
│   └── content.css
├── icons/                  # 아이콘 이미지
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── browser-polyfill.js     # 브라우저 API 호환성
```

## 브라우저별 설치 방법

### Microsoft Edge

1. Edge 브라우저를 실행합니다
2. 주소창에 `edge://extensions/`를 입력하고 Enter를 누릅니다
3. 왼쪽 하단의 **"개발자 모드"** 토글을 활성화합니다
4. 상단의 **"압축을 푼 확장 로드"** 버튼을 클릭합니다
5. 이 프로젝트 폴더를 선택합니다
6. 확장프로그램이 설치되면 브라우저 툴바에 아이콘이 표시됩니다

### Google Chrome

1. Chrome 브라우저를 실행합니다
2. 주소창에 `chrome://extensions/`를 입력하고 Enter를 누릅니다
3. 오른쪽 상단의 **"개발자 모드"** 토글을 활성화합니다
4. 왼쪽 상단의 **"압축해제된 확장 프로그램을 로드합니다"** 버튼을 클릭합니다
5. 이 프로젝트 폴더를 선택합니다
6. 확장프로그램이 설치되면 브라우저 툴바에 아이콘이 표시됩니다

### Mozilla Firefox

1. Firefox 브라우저를 실행합니다
2. 주소창에 `about:debugging#/runtime/this-firefox`를 입력하고 Enter를 누릅니다
3. **"임시 부가 기능 로드..."** 버튼을 클릭합니다
4. 프로젝트 폴더에서 `manifest.json` 파일을 선택합니다
5. 확장프로그램이 설치됩니다 (Firefox를 재시작하면 제거됩니다)

**Firefox 영구 설치 (서명 필요):**
- Firefox에서 영구적으로 설치하려면 [Firefox Add-ons](https://addons.mozilla.org/)에 제출하여 서명을 받아야 합니다

### Brave Browser

1. Brave 브라우저를 실행합니다
2. 주소창에 `brave://extensions/`를 입력하고 Enter를 누릅니다
3. 오른쪽 상단의 **"개발자 모드"** 토글을 활성화합니다
4. **"압축해제된 확장 프로그램을 로드합니다"** 버튼을 클릭합니다
5. 이 프로젝트 폴더를 선택합니다

### Opera

1. Opera 브라우저를 실행합니다
2. 주소창에 `opera://extensions`를 입력하고 Enter를 누릅니다
3. 오른쪽 상단의 **"개발자 모드"** 버튼을 클릭합니다
4. **"압축해제된 확장 프로그램 로드..."** 버튼을 클릭합니다
5. 이 프로젝트 폴더를 선택합니다

## 사용 방법

1. [enterjoy.day](https://enterjoy.day)에 접속합니다
2. 화면 오른쪽 하단에 타이머가 자동으로 표시됩니다:
   - **맨 위**: 댓글 쿨다운 타이머 (💬)
   - **중간**: 포인트 수집 타이머 (🎁)
   - **맨 아래**: 무료포인트 수령 타이머 (💰)
3. 무료포인트 수령 타이머가 "포인트 수령 (클릭)" 상태가 되면 클릭하여 포인트 페이지로 이동합니다
4. 브라우저 툴바의 확장프로그램 아이콘을 클릭하면 팝업에서 상태를 확인할 수 있습니다

## 개발 가이드

### Manifest.json
확장프로그램의 메타데이터와 권한을 정의합니다.

### Popup
- 확장프로그램 아이콘 클릭 시 표시되는 UI
- HTML, CSS, JavaScript로 구성
- Chrome Storage API를 통해 데이터 저장/로드

### Background Service Worker
- 확장프로그램의 이벤트 핸들러
- 알람, 알림, API 호출 등 백그라운드 작업 처리
- 확장프로그램이 활성화된 동안 계속 실행

### Content Script
- 웹 페이지의 DOM에 직접 접근
- 페이지 내용 읽기 및 수정
- 페이지와 확장프로그램 간 통신

## 사용된 API

- `chrome.storage` - 데이터 저장/로드
- `chrome.tabs` - 탭 관리
- `chrome.runtime` - 확장프로그램 런타임 이벤트
- `chrome.action` - 확장프로그램 아이콘 동작
- `chrome.alarms` - 주기적 작업 스케줄링

## 권한 설명

- `storage` - 데이터 저장/로드
- `activeTab` - 현재 활성 탭 접근
- `host_permissions` - 웹사이트 접근 권한

## 디버깅

1. **Popup 디버깅**: 팝업을 연 상태에서 우클릭 → 검사
2. **Background 디버깅**: `edge://extensions/` → 서비스 워커 검사
3. **Content Script 디버깅**: 웹 페이지에서 F12 → Console 탭

## 배포

1. 코드를 완성합니다
2. 아이콘을 추가합니다 (16x16, 48x48, 128x128)
3. 프로젝트 폴더를 ZIP으로 압축합니다
4. [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/overview)에 업로드합니다

## 참고 자료

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Microsoft Edge Extensions](https://docs.microsoft.com/microsoft-edge/extensions-chromium/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)

## 라이선스

MIT License
