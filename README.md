# EnterJoy Extension

Edge 브라우저 확장프로그램 템플릿입니다.

## 구조

```
EnterJoy/
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
└── README.md
```

## 주요 기능

- **Popup UI**: 확장프로그램 아이콘 클릭 시 표시되는 팝업 인터페이스
- **Background Service Worker**: 백그라운드에서 실행되는 스크립트
- **Content Script**: 웹 페이지에 직접 주입되어 실행되는 스크립트
- **Storage API**: 설정 및 데이터 저장
- **Message Passing**: 컴포넌트 간 통신

## 설치 방법

1. Edge 브라우저를 엽니다
2. `edge://extensions/` 로 이동합니다
3. 오른쪽 상단의 "개발자 모드"를 활성화합니다
4. "압축해제된 확장 로드" 버튼을 클릭합니다
5. 이 프로젝트 폴더를 선택합니다

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
