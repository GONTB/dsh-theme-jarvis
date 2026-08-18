// ═══════════════════════════════════════════════════════════════════════
// dsh-theme-jarvis v0.2 — J.A.R.V.I.S. / Iron Man HUD theme
// for the DeepSeek Harness Web UI (browser half).
//
// 官方客户端模块形状（window.__ModuleLoader__ 惰性 CJS 模型）：本文件由
// shell 以 /plugins/dsh-theme-jarvis/client.js 提供并挂进模块表，React 通过
// require('react')（平台种子模块）取得。纯 JS：不含 import/export 语句。
//
// 主题机制（官方 API，仅走接缝）：
//   - ctx.theme.register({id, colorScheme, tokens}) 注册两套完整
//     --dsw-alias-* / --dsw-specific-* token 主题（夜航 / 昼光），
//     ctx.theme.setTheme(id) 切换；明暗语义由主题服务呈现器负责。
//   - slots.inject('settings.section', ...) 注册「JARVIS 控制台」设置区。
//   - 特效（扫描线 / 辉光 / 开机动画）为纯 CSS + body class 门控，
//     不碰任何 vendor 文件。
//
// 语音唤醒系统（Web Speech API，Chromium）：
//   - 说「贾维斯」（可在设置面板自定义）唤醒 → HUD + 提示音 →
//     继续说话自动转写，经官方 conversation.input.right 契约的
//     useInput / inputActions 写入输入框草稿，可修改后发送。
//     参考 https://github.com/Hjay1101/dsh-plugin-voice-input 的通道用法。
//   - 静音/网络错误自动重连，页面隐藏暂停，degrade 优雅。
// 偏好保存在 localStorage（dsh-theme-jarvis:settings）。
//
// 参考实现：
//   - https://github.com/Tommy00748/dsh-theme-cyberpunk2077
//   - https://github.com/BeiZi6/dsh-theme-plugin
// ═══════════════════════════════════════════════════════════════════════
window.__ModuleLoader__.load({
	id: 'dsh-theme-jarvis',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		const React = require('react')

		// ───────────────────────────────────────────────────────────────
		// 常量
		// ───────────────────────────────────────────────────────────────

		const THEME_DARK = 'jarvis-night' // 夜航模式：方舟反应堆青 × 深空
		const THEME_LIGHT = 'jarvis-day' // 昼光模式：斯塔克工业实验室
		const STORE_KEY = 'dsh-theme-jarvis:settings'
		const FX_STYLE_ID = 'dsh-theme-jarvis-fx'
		const WALLPAPER_STORE_KEY = 'dsh-theme-jarvis:wallpapers'
		const WALLPAPER_DEFAULT_URL = '/api/dsh-theme-jarvis/wallpaper/default'
		const DONATE_QR_URL = '/api/dsh-theme-jarvis/donate/qrcode'
		// 压缩参数（参考 dsh-dream-skin）：canvas 降采样 + JPEG，目标 ≤2MB，
		// 让用户壁纸稳稳落在 localStorage 配额内、渲染也更快。
		const WALLPAPER_MAX_BYTES = 10 * 1024 * 1024 // 原始文件上限 10MB（导入时压缩）
		// 总配额上限压在 localStorage 典型 5MB 配额之下，避免保存静默失败
		const WALLPAPER_TOTAL_LIMIT = 4 * 1024 * 1024
		const WALLPAPER_DATA_LIMIT = 2 * 1024 * 1024 // 压缩后单张目标上限
		const WALLPAPER_DEFAULT_OPACITY = 1 // 表面不透明度（0.2..1），1 = 出厂调校
		const WALLPAPER_DEFAULT_BLUR = 0 // 壁纸自身模糊（0..60px）
		const UI_FONT =
			'"Bahnschrift", "DIN Alternate", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
		const CODE_FONT =
			'"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, "Courier New", monospace'

		const DEFAULT_SETTINGS = Object.freeze({
			mode: 'dark', // dark | light | system
			scanlines: true,
			glow: true,
			boot: true,
			pet: true, // 右下角贾维斯全息粒子宠物
			petForm: 'jarvis', // jarvis（金色收敛球）| ultron（蓝色混沌网）| auto（错误态化身奥创）
			voice: false, // 语音唤醒开关（默认关：首次开启时浏览器会弹麦克风授权）
			wakeWord: '贾维斯', // 可自定义唤醒词（含 CJK 自动用 zh-CN 识别，否则 en-US）
			sttBackend: 'auto', // auto（浏览器优先，network 失败自动降级云端）| web | cloud | local（本地 FunASR 离线）
			wallpaper: 'none', // none | default（内置壁纸）| user:<id>（本机图片）
			wallpaperOpacity: WALLPAPER_DEFAULT_OPACITY, // 0.2..1 表面不透明度
			wallpaperBlur: WALLPAPER_DEFAULT_BLUR, // 0..60 壁纸模糊 px
			typingSfx: true, // 输入框打字音效（Web Audio 合成，参考 cyberpunk2077）
		})

		// ───────────────────────────────────────────────────────────────
		// Token 表 — 只覆盖官方别名语义层（--dsw-alias-*）与
		// 平台特定层（--dsw-specific-*），不触碰 --dsw-static-* 内部标尺。
		// 两套 key 完全一致，冒烟测试会校验。
		// ───────────────────────────────────────────────────────────────

		const DARK_TOKENS = {
			// surfaces — 深空海军蓝
			'--dsw-alias-bg-base': '#050B14',
			'--dsw-alias-bg-layer-1': '#0A1424',
			'--dsw-alias-bg-layer-2': '#0C182C',
			'--dsw-alias-bg-layer-3': '#102138',
			'--dsw-alias-bg-overlay': '#0B1728',
			'--dsw-alias-bg-module-platform': '#081120',
			'--dsw-alias-bg-multi-select': '#0E1B2E',
			'--dsw-alias-bg-skeleton': 'rgba(59, 220, 244, 0.08)',
			'--dsw-alias-bg-mask-1': 'rgba(2, 6, 12, 0.72)',
			'--dsw-alias-bg-mask-2': 'rgba(2, 6, 12, 0.45)',
			'--dsw-alias-bg-mask-3': 'rgba(2, 6, 12, 0.72)',
			'--dsw-alias-bg-mask-photo': 'rgba(2, 6, 12, 0.90)',
			'--dsw-alias-bg-mask-drop': 'rgba(5, 11, 20, 0.75)',

			// labels
			'--dsw-alias-label-primary': '#D9F1FF',
			'--dsw-alias-label-secondary': '#8FB3D4',
			'--dsw-alias-label-tertiary': '#5F84A8',
			'--dsw-alias-label-caption': '#7FA6C8',
			'--dsw-alias-label-dimmed': '#4E6E90',
			'--dsw-alias-label-primary-bluish': '#D9F1FF',
			'--dsw-alias-label-primary-dimmed': '#CFEAFF',
			'--dsw-alias-label-primary-foreground': '#03212E',
			'--dsw-alias-label-primary-inverted': '#03212E',

			// brand — 方舟反应堆青
			'--dsw-alias-brand-primary': '#3BDCF4',
			'--dsw-alias-brand-text': '#3BDCF4',
			'--dsw-alias-brand-primary-invert': '#032430',
			'--dsw-alias-brand-primary-new-colorprimary-new-color': '#3BDCF4',

			// buttons
			'--dsw-alias-button-primary-fill': '#3BDCF4',
			'--dsw-alias-button-primary-hover': '#5BE7FA',
			'--dsw-alias-button-primary-dimmed': 'rgba(59, 220, 244, 0.14)',
			'--dsw-alias-button-contrast-fill': '#D9F1FF',
			'--dsw-alias-button-elevated-fill': '#0E1A2C',
			'--dsw-alias-button-floating-fill': '#0C1828',
			'--dsw-alias-button-floating-hover': '#122238',
			'--dsw-alias-button-ghost-active-fill': '#0E1C30',
			'--dsw-alias-button-ghost-active-hover': '#142540',
			'--dsw-alias-button-ghost-active-border': '#3BDCF4',
			'--dsw-alias-button-info-fill': '#F5B33C',
			'--dsw-alias-button-info-hover': '#FFC45C',
			'--dsw-alias-button-tool-bar-fill-invisible': 'rgba(59, 220, 244, 0.10)',
			'--dsw-alias-button-tool-bar-fill': 'rgba(59, 220, 244, 0.16)',
			'--dsw-alias-button-tool-bar-hover': 'rgba(59, 220, 244, 0.26)',

			// interactive
			'--dsw-alias-interactive-bg-hover': 'rgba(59, 220, 244, 0.09)',
			'--dsw-alias-interactive-bg-active': 'rgba(59, 220, 244, 0.16)',
			'--dsw-alias-interactive-bg-hover-accent': 'rgba(59, 220, 244, 0.14)',
			'--dsw-alias-interactive-bg-hover-danger': 'rgba(255, 77, 94, 0.12)',
			'--dsw-alias-interactive-bg-hover-solid': '#12223A',

			// borders
			'--dsw-alias-border-l1': 'rgba(59, 220, 244, 0.12)',
			'--dsw-alias-border-l2': 'rgba(59, 220, 244, 0.22)',
			'--dsw-alias-border-l2-darkmode-thin': 'rgba(59, 220, 244, 0.10)',
			'--dsw-alias-border-l3': 'rgba(245, 179, 60, 0.24)',
			'--dsw-alias-border-l4': 'rgba(59, 220, 244, 0.36)',
			'--dsw-alias-border-inverted': 'rgba(255, 255, 255, 0.10)',
			'--dsw-alias-border-inverted2': 'rgba(255, 255, 255, 0.14)',

			// state
			'--dsw-alias-state-business-primary': '#3BDCF4',
			'--dsw-alias-state-business-tertiary': '#0A2A38',
			'--dsw-alias-state-error-primary': '#FF4D5E',
			'--dsw-alias-state-error-secondary': '#FF6B7A',
			'--dsw-alias-state-success-primary': '#2FE8A0',
			'--dsw-alias-state-success-secondary': '#5CF5BC',
			'--dsw-alias-state-success-tertiary': '#073024',
			'--dsw-alias-state-warn-label': '#FFC45C',
			'--dsw-alias-state-warn-primary': '#F5B33C',
			'--dsw-alias-state-warn-secondary': '#FFC45C',
			'--dsw-alias-state-warn-tertiary': '#33270A',

			// markdown / code
			'--dsw-alias-markdown-code-block': '#060D18',
			'--dsw-alias-markdown-code-block-banner': '#0A1424',
			'--dsw-alias-markdown-inline-code': '#10233A',
			'--dsw-alias-markdown-placeholder': '#0C1828',
			'--dsw-alias-markdown-tag': '#0E1D31',
			'--dsw-alias-markdown-citation': '#0D1A2C',
			'--dsw-alias-markdown-code-segment-selected': '#10223A',
			'--dsw-alias-markdown-code-segment-unselected': '#081120',

			// scrollbar
			'--dsw-alias-scrollbar-bg-l1': 'rgba(59, 220, 244, 0.28)',
			'--dsw-alias-scrollbar-bg-l2': 'rgba(59, 220, 244, 0.34)',
			'--dsw-alias-scrollbar-hover-l1': 'rgba(59, 220, 244, 0.50)',
			'--dsw-alias-scrollbar-hover-l2': 'rgba(59, 220, 244, 0.58)',

			// toast / tooltip
			'--dsw-alias-toast-bg': '#0B1728',
			'--dsw-alias-tooltip-bg': '#0F1E33',

			// specific surfaces
			'--dsw-specific-bubble': '#0A1626',
			'--dsw-specific-bubble-highlight': '#0F3046',
			'--dsw-specific-input-major': '#060E1A',
			'--dsw-specific-login-input': '#050C16',
			'--dsw-specific-menu': '#0E1C30',
			'--dsw-specific-selector': '#0C1828',
			'--dsw-specific-tip': '#0B182A',
			'--dsw-specific-sidebar-fill': '#050B14',
			'--dsw-specific-sidebar-nav-item-active': '#0E1E33',
			'--dsw-specific-sidebar-nav-item-active-accent': '#3BDCF4',
			'--dsw-specific-sidebar-nav-item-hover': '#0C1626',

			// fonts
			'--dsw-font-family': UI_FONT,
			'--ds-font-family-code': CODE_FONT,
		}

		const LIGHT_TOKENS = {
			// surfaces — 实验室蓝图白
			'--dsw-alias-bg-base': '#EAF2F7',
			'--dsw-alias-bg-layer-1': '#FFFFFF',
			'--dsw-alias-bg-layer-2': '#F5FAFC',
			'--dsw-alias-bg-layer-3': '#E3EEF5',
			'--dsw-alias-bg-overlay': '#FFFFFF',
			'--dsw-alias-bg-module-platform': '#EFF6FA',
			'--dsw-alias-bg-multi-select': '#EAF3F8',
			'--dsw-alias-bg-skeleton': 'rgba(0, 163, 201, 0.10)',
			'--dsw-alias-bg-mask-1': 'rgba(10, 26, 38, 0.30)',
			'--dsw-alias-bg-mask-2': 'rgba(10, 26, 38, 0.16)',
			'--dsw-alias-bg-mask-3': 'rgba(10, 26, 38, 0.45)',
			'--dsw-alias-bg-mask-photo': 'rgba(10, 26, 38, 0.85)',
			'--dsw-alias-bg-mask-drop': 'rgba(233, 241, 246, 0.80)',

			// labels
			'--dsw-alias-label-primary': '#0B2233',
			'--dsw-alias-label-secondary': '#45667D',
			'--dsw-alias-label-tertiary': '#5F7E94',
			'--dsw-alias-label-caption': '#54778F',
			'--dsw-alias-label-dimmed': '#8AA5B8',
			'--dsw-alias-label-primary-bluish': '#0B2233',
			'--dsw-alias-label-primary-dimmed': '#14303F',
			'--dsw-alias-label-primary-foreground': '#FFFFFF',
			'--dsw-alias-label-primary-inverted': '#FFFFFF',

			// brand — 深青（白底可读）
			'--dsw-alias-brand-primary': '#00A3C9',
			'--dsw-alias-brand-text': '#008FB0',
			'--dsw-alias-brand-primary-invert': '#FFFFFF',
			'--dsw-alias-brand-primary-new-colorprimary-new-color': '#00A3C9',

			// buttons
			'--dsw-alias-button-primary-fill': '#00A3C9',
			'--dsw-alias-button-primary-hover': '#00B5DF',
			'--dsw-alias-button-primary-dimmed': 'rgba(0, 163, 201, 0.12)',
			'--dsw-alias-button-contrast-fill': '#0B2233',
			'--dsw-alias-button-elevated-fill': '#FFFFFF',
			'--dsw-alias-button-floating-fill': '#FFFFFF',
			'--dsw-alias-button-floating-hover': '#F0F7FB',
			'--dsw-alias-button-ghost-active-fill': '#E6F2F8',
			'--dsw-alias-button-ghost-active-hover': '#DCEFF7',
			'--dsw-alias-button-ghost-active-border': '#00A3C9',
			'--dsw-alias-button-info-fill': '#C77B12',
			'--dsw-alias-button-info-hover': '#DA8A1E',
			'--dsw-alias-button-tool-bar-fill-invisible': 'rgba(0, 163, 201, 0.08)',
			'--dsw-alias-button-tool-bar-fill': 'rgba(0, 163, 201, 0.14)',
			'--dsw-alias-button-tool-bar-hover': 'rgba(0, 163, 201, 0.22)',

			// interactive
			'--dsw-alias-interactive-bg-hover': 'rgba(0, 163, 201, 0.07)',
			'--dsw-alias-interactive-bg-active': 'rgba(0, 163, 201, 0.14)',
			'--dsw-alias-interactive-bg-hover-accent': 'rgba(0, 163, 201, 0.12)',
			'--dsw-alias-interactive-bg-hover-danger': 'rgba(217, 43, 63, 0.08)',
			'--dsw-alias-interactive-bg-hover-solid': '#E7F1F7',

			// borders
			'--dsw-alias-border-l1': 'rgba(11, 34, 51, 0.10)',
			'--dsw-alias-border-l2': 'rgba(11, 34, 51, 0.20)',
			'--dsw-alias-border-l2-darkmode-thin': 'rgba(11, 34, 51, 0.08)',
			'--dsw-alias-border-l3': 'rgba(199, 123, 18, 0.35)',
			'--dsw-alias-border-l4': 'rgba(0, 163, 201, 0.45)',
			'--dsw-alias-border-inverted': 'rgba(255, 255, 255, 0.55)',
			'--dsw-alias-border-inverted2': 'rgba(255, 255, 255, 0.65)',

			// state
			'--dsw-alias-state-business-primary': '#00A3C9',
			'--dsw-alias-state-business-tertiary': '#D9EFF6',
			'--dsw-alias-state-error-primary': '#D92B3F',
			'--dsw-alias-state-error-secondary': '#E5485B',
			'--dsw-alias-state-success-primary': '#0E9E6E',
			'--dsw-alias-state-success-secondary': '#2BB989',
			'--dsw-alias-state-success-tertiary': '#DFF5EC',
			'--dsw-alias-state-warn-label': '#8F5A0D',
			'--dsw-alias-state-warn-primary': '#C77B12',
			'--dsw-alias-state-warn-secondary': '#DA8A1E',
			'--dsw-alias-state-warn-tertiary': '#F7EBD5',

			// markdown / code
			'--dsw-alias-markdown-code-block': '#F4F9FC',
			'--dsw-alias-markdown-code-block-banner': '#EAF3F8',
			'--dsw-alias-markdown-inline-code': '#DCEAF2',
			'--dsw-alias-markdown-placeholder': '#F0F6FA',
			'--dsw-alias-markdown-tag': '#E6F0F6',
			'--dsw-alias-markdown-citation': '#E9F2F7',
			'--dsw-alias-markdown-code-segment-selected': '#D6E8F1',
			'--dsw-alias-markdown-code-segment-unselected': '#F0F6FA',

			// scrollbar
			'--dsw-alias-scrollbar-bg-l1': 'rgba(0, 163, 201, 0.30)',
			'--dsw-alias-scrollbar-bg-l2': 'rgba(0, 163, 201, 0.36)',
			'--dsw-alias-scrollbar-hover-l1': 'rgba(0, 163, 201, 0.52)',
			'--dsw-alias-scrollbar-hover-l2': 'rgba(0, 163, 201, 0.60)',

			// toast / tooltip
			'--dsw-alias-toast-bg': '#FFFFFF',
			'--dsw-alias-tooltip-bg': '#FFFFFF',

			// specific surfaces
			'--dsw-specific-bubble': '#F2F8FB',
			'--dsw-specific-bubble-highlight': '#D6EDF6',
			'--dsw-specific-input-major': '#FFFFFF',
			'--dsw-specific-login-input': '#FBFDFE',
			'--dsw-specific-menu': '#FFFFFF',
			'--dsw-specific-selector': '#F4FAFC',
			'--dsw-specific-tip': '#0B2233',
			'--dsw-specific-sidebar-fill': '#E5EEF4',
			'--dsw-specific-sidebar-nav-item-active': '#DCEBF3',
			'--dsw-specific-sidebar-nav-item-active-accent': '#00A3C9',
			'--dsw-specific-sidebar-nav-item-hover': '#ECF4F8',

			// fonts
			'--dsw-font-family': UI_FONT,
			'--ds-font-family-code': CODE_FONT,
		}

		// ───────────────────────────────────────────────────────────────
		// 特效 CSS —— 全部由 body class 门控，切换即时生效
		// ───────────────────────────────────────────────────────────────

		const FX_CSS = [
			// 基础身份：选区、光标、滚动条（引用 token，明暗自动跟随）
			'::selection { background: rgba(59, 220, 244, 0.30); }',
			'body[data-ds-dark-theme] ::selection { background: rgba(59, 220, 244, 0.36); }',
			'textarea { caret-color: var(--dsw-alias-brand-primary); }',
			'::-webkit-scrollbar { width: 10px; height: 10px; }',
			'::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }',
			'::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l1, rgba(59,220,244,.28)); border-radius: 6px; }',
			'::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-scrollbar-hover-l1, rgba(59,220,244,.5)); }',

			// HUD 主框架角标
			"[class*='frame'] { position: relative; }",
			"[class*='frame']::before, [class*='frame']::after { content: ''; position: absolute; width: 24px; height: 24px; pointer-events: none; z-index: 2; opacity: .5; }",
			"[class*='frame']::before { top: 0; left: 0; border-top: 2px solid var(--dsw-alias-brand-primary); border-left: 2px solid var(--dsw-alias-brand-primary); }",
			"[class*='frame']::after { bottom: 0; right: 0; border-bottom: 2px solid var(--dsw-alias-brand-primary); border-right: 2px solid var(--dsw-alias-brand-primary); }",

			// Logo 区
			"[class*='logoRow'] { letter-spacing: .14em; }",
			"[class*='logoRow'] svg, [class*='logoRow'] path { color: var(--dsw-alias-brand-primary) !important; }",

			// 侧栏 HUD 轨道
			"[class*='sidebarCol'] { box-shadow: inset -1px 0 0 var(--dsw-alias-border-l2); }",
			"[class*='sidebarCol'] [class*='railFish'], [class*='sidebarCol'] svg { color: var(--dsw-alias-brand-primary) !important; }",

			// 会话行（box-shadow 左沿，不引起布局位移）
			"[class*='_sessionRow'] { box-shadow: inset 2px 0 0 transparent; }",
			"[class*='_sessionRow'][class*='_selected'] { box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }",

			// 错误通知：左侧红色警示沿
			"[class*='_noticeError'] { box-shadow: inset 3px 0 0 var(--dsw-alias-state-error-primary); }",

			// ── 辉光（body.jarvis-glow 门控）──────────────────────────
			"body.jarvis-glow button[class*='primary'], body.jarvis-glow button[class*='newSession'], body.jarvis-glow button[class*='add'] {",
			'  box-shadow: 0 0 12px rgba(59, 220, 244, 0.30), 0 0 2px rgba(59, 220, 244, 0.55);',
			'  animation: jarvisArc 3.4s ease-in-out infinite;',
			'}',
			'@keyframes jarvisArc {',
			'  0%, 100% { box-shadow: 0 0 8px rgba(59, 220, 244, 0.22), 0 0 1px rgba(59, 220, 244, 0.4); }',
			'  50% { box-shadow: 0 0 20px rgba(59, 220, 244, 0.50), 0 0 4px rgba(59, 220, 244, 0.85); }',
			'}',
			"body.jarvis-glow [class*='_sessionRow']:hover { filter: drop-shadow(0 0 4px rgba(59, 220, 244, 0.28)); }",
			"body.jarvis-glow [class*='_card']:has(textarea:focus) { box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary), 0 0 18px rgba(59, 220, 244, 0.22); }",
			"body.jarvis-glow [class*='_notice'], body.jarvis-glow [class*='_toast'] { box-shadow: 0 0 12px rgba(59, 220, 244, 0.16); }",

			// ── 扫描线 + 暗角（body.jarvis-scanlines 门控）────────────
			'#jarvis-scanlines, #jarvis-vignette { display: none; }',
			'body.jarvis-scanlines #jarvis-scanlines, body.jarvis-scanlines #jarvis-vignette { display: block; }',
			'#jarvis-scanlines { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;',
			'  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.14) 0 1px, transparent 1px 3px); }',
			'body[data-ds-dark-theme] #jarvis-scanlines {',
			'  background: repeating-linear-gradient(0deg, rgba(59, 220, 244, 0.045) 0 1px, transparent 1px 3px),',
			'              repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0 1px, transparent 1px 3px); }',
			'#jarvis-vignette { position: fixed; inset: 0; z-index: 2147483644; pointer-events: none;',
			'  background: radial-gradient(120% 92% at 50% 44%, transparent 58%, rgba(3, 10, 18, 0.38) 100%); }',
			'body[data-ds-dark-theme] #jarvis-vignette {',
			'  background: radial-gradient(120% 92% at 50% 44%, transparent 55%, rgba(0, 0, 0, 0.6) 100%); }',

			// ── 开机动画 ────────────────────────────────────────────
			'#jarvis-boot { position: fixed; inset: 0; z-index: 2147483647; background: #04080F;',
			'  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;',
			'  pointer-events: none; animation: jarvisBootFade 2.6s ease forwards; }',
			'#jarvis-boot .jb-line { position: relative; width: min(420px, 70vw); height: 2px;',
			'  background: linear-gradient(90deg, transparent, rgba(59, 220, 244, 0.9), transparent); }',
			'#jarvis-boot .jb-line::after { content: ""; position: absolute; left: 0; top: -2px; width: 34px; height: 6px;',
			'  background: #AEF2FF; box-shadow: 0 0 12px 2px rgba(59, 220, 244, 0.8);',
			'  animation: jarvisBootScan 1.4s cubic-bezier(0.3, 0.6, 0.4, 1) forwards; }',
			'#jarvis-boot .jb-title { font: 700 clamp(30px, 6vw, 64px) "Bahnschrift", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;',
			'  letter-spacing: 0.3em; color: #CFF4FF; text-shadow: 0 0 24px rgba(59, 220, 244, 0.65);',
			'  animation: jarvisBootTitle 1.6s ease forwards; }',
			'#jarvis-boot .jb-sub { font: 400 clamp(11px, 1.6vw, 15px) "Cascadia Code", Consolas, monospace;',
			'  letter-spacing: 0.42em; color: #3BDCF4; opacity: 0; animation: jarvisBootSub 1.4s ease forwards; }',
			'#jarvis-boot .jb-log { margin-top: 16px; white-space: nowrap;',
			'  font: 400 clamp(10px, 1.3vw, 13px) "Cascadia Code", Consolas, monospace;',
			'  letter-spacing: 0.22em; color: rgba(143, 179, 212, 0.75); opacity: 0; animation: jarvisBootSub 1.2s ease forwards; }',
			'@keyframes jarvisBootFade { 0%, 82% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }',
			'@keyframes jarvisBootScan { 0% { left: -8%; opacity: 0.2; } 55% { opacity: 1; } 100% { left: 104%; opacity: 0; } }',
			'@keyframes jarvisBootTitle { 0% { opacity: 0; letter-spacing: 0.12em; filter: blur(6px); }',
			'  18% { opacity: 1; } 100% { opacity: 1; letter-spacing: 0.3em; filter: blur(0); } }',
			'@keyframes jarvisBootSub { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 1; } }',

			// ── 语音唤醒 HUD ─────────────────────────────────────────
			'#jarvis-wake-hud { position: fixed; top: 18px; left: 50%; transform: translateX(-50%);',
			'  z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 8px;',
			'  pointer-events: none; opacity: 0; transition: opacity 0.25s ease; }',
			'#jarvis-wake-hud.jarvis-hud-on { opacity: 1; }',
			'#jarvis-wake-hud .jh-title { font: 700 13px "Bahnschrift", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;',
			'  letter-spacing: 0.3em; color: var(--dsw-alias-brand-primary); text-shadow: 0 0 14px rgba(59, 220, 244, 0.6);',
			'  padding: 8px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;',
			'  background: var(--dsw-alias-bg-overlay); }',
			'#jarvis-wake-hud .jh-title.jarvis-pulse { animation: jarvisHudPulse 1.2s ease-in-out infinite; }',
			'#jarvis-wake-hud .jh-text { max-width: min(640px, 80vw);',
			'  font: 400 13px/20px "Cascadia Code", Consolas, "PingFang SC", "Microsoft YaHei", monospace;',
			'  letter-spacing: 0.04em; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-overlay);',
			'  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 6px 12px;',
			'  overflow-wrap: break-word; }',
			'@keyframes jarvisHudPulse {',
			'  0%, 100% { box-shadow: 0 0 6px rgba(59, 220, 244, 0.25); }',
			'  50% { box-shadow: 0 0 18px rgba(59, 220, 244, 0.6); }',
			'}',

			// ── JARVIS 全息粒子宠物 ────────────────────────────────────
			'#jarvis-pet { position: fixed; right: 18px; bottom: 18px; width: 156px; height: 156px;',
			'  z-index: 2147483600; cursor: grab; touch-action: none; display: none;',
			'  filter: drop-shadow(0 0 10px rgba(59, 220, 244, 0.25)); }',
			'#jarvis-pet:active { cursor: grabbing; }',
			'body.jarvis-pet-on #jarvis-pet { display: block; }',

			// ── 背景壁纸（body.jarvis-wallpaper 门控）──────────────────
			// 壁纸层是固定在 body 底部的单个 div（z-index:-1，内联样式由
			// applyWallpaper 管理）。
			// 注意：绝不能在 sidebarCol / 输入区等容器上使用 backdrop-filter
			// 或 filter —— 它们会让元素成为 position:fixed 后代的包含块，
			// 而设置模态框（sidebar.settings → SettingsRoot）与输入区弹层
			// 恰好是这些容器的后代，会被"吸"到侧边栏位置（v0.6.0 曾踩坑）。
			// 毛玻璃观感由半透明表面 token + 壁纸模糊滑块（作用于壁纸层
			// 自身，不产生包含块）承担。
			'#jarvis-wallpaper { display: block; }',

			// 性能与无障碍护栏
			'@media (prefers-reduced-motion: reduce) {',
			'  #jarvis-boot { display: none !important; }',
			'  #jarvis-wake-hud .jh-title.jarvis-pulse { animation: none !important; }',
			"  body.jarvis-glow button[class*='primary'], body.jarvis-glow button[class*='newSession'], body.jarvis-glow button[class*='add'] { animation: none !important; }",
			'}',
			'@media (max-width: 768px) {',
			"[class*='frame']::before, [class*='frame']::after { display: none; }",
			'  #jarvis-vignette { display: none !important; }',
			'  #jarvis-pet { display: none !important; }',
			'}',
		].join('\n')

		// ───────────────────────────────────────────────────────────────
		// 偏好持久化
		// ───────────────────────────────────────────────────────────────

		function loadSettings() {
			try {
				const raw = window.localStorage.getItem(STORE_KEY)
				if (!raw) return { ...DEFAULT_SETTINGS }
				const parsed = JSON.parse(raw)
				if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }
				const wakeWord =
					typeof parsed.wakeWord === 'string' && parsed.wakeWord.trim().length > 0
						? parsed.wakeWord.trim().slice(0, 12)
						: DEFAULT_SETTINGS.wakeWord
				const sttBackend =
					parsed.sttBackend === 'web' || parsed.sttBackend === 'cloud' || parsed.sttBackend === 'local'
						? parsed.sttBackend
						: 'auto'
				const wallpaper = normalizeWallpaper(parsed.wallpaper)
				const num = (value, min, max, fallback) => {
					const n = Number(value)
					return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
				}
				return {
					mode: parsed.mode === 'light' || parsed.mode === 'system' ? parsed.mode : 'dark',
					scanlines: parsed.scanlines !== false,
					glow: parsed.glow !== false,
					boot: parsed.boot !== false,
					pet: parsed.pet !== false,
					petForm:
						parsed.petForm === 'ultron' || parsed.petForm === 'auto' ? parsed.petForm : 'jarvis',
					voice: parsed.voice === true,
					wakeWord,
					sttBackend,
					wallpaper,
					wallpaperOpacity: num(parsed.wallpaperOpacity, 0.2, 1, WALLPAPER_DEFAULT_OPACITY),
					wallpaperBlur: num(parsed.wallpaperBlur, 0, 60, WALLPAPER_DEFAULT_BLUR),
					typingSfx: parsed.typingSfx !== false,
				}
			} catch {
				return { ...DEFAULT_SETTINGS }
			}
		}

		function saveSettings(settings) {
			try {
				window.localStorage.setItem(STORE_KEY, JSON.stringify(settings))
			} catch {
				/* 隐私模式等场景下静默失败 */
			}
		}

		// ───────────────────────────────────────────────────────────────
		// 背景壁纸：系统默认（host 静态路由）+ 用户本机图片（localStorage）
		// ───────────────────────────────────────────────────────────────

		// 内存镜像：保存失败（配额满 / 隐私模式）时仍保证本次会话内
		// 添加→选中→应用全链路可用；loadWallpapers 优先读镜像。
		let wallpapersCache = null

		function loadWallpapers() {
			try {
				if (wallpapersCache) return wallpapersCache
				const raw = window.localStorage.getItem(WALLPAPER_STORE_KEY)
				if (!raw) {
					wallpapersCache = []
					return wallpapersCache
				}
				const parsed = JSON.parse(raw)
				wallpapersCache = Array.isArray(parsed)
					? parsed.filter(
							(item) =>
								item &&
								typeof item.id === 'string' &&
								typeof item.name === 'string' &&
								typeof item.dataUrl === 'string' &&
								item.dataUrl.indexOf('data:image/') === 0,
						)
					: []
				return wallpapersCache
			} catch {
				return wallpapersCache || []
			}
		}

		/** 保存壁纸库：始终更新内存镜像；@returns 是否成功持久化到 localStorage */
		function saveWallpapers(list) {
			const valid = Array.isArray(list)
				? list.filter(
						(item) =>
							item &&
							typeof item.id === 'string' &&
							typeof item.name === 'string' &&
							typeof item.dataUrl === 'string' &&
							item.dataUrl.indexOf('data:image/') === 0,
					)
				: []
			wallpapersCache = valid
			try {
				window.localStorage.setItem(WALLPAPER_STORE_KEY, JSON.stringify(valid))
				return true
			} catch {
				return false // 配额满 / 隐私模式：本次会话仍可用，刷新后丢失
			}
		}

		/** 校验持久化值：只接受 none / default / 仍存在于库中的 user:<id> */
		function normalizeWallpaper(value) {
			if (value === 'default') return 'default'
			if (typeof value === 'string' && value.indexOf('user:') === 0) {
				const id = value.slice(5)
				if (loadWallpapers().some((item) => item.id === id)) return value
			}
			return 'none'
		}

		/** 解析当前壁纸选择 → { url, name } 或 null（无壁纸） */
		function wallpaperInfo(settings) {
			const w = settings && settings.wallpaper ? settings.wallpaper : 'none'
			if (w === 'default') return { url: WALLPAPER_DEFAULT_URL, name: '系统默认' }
			if (typeof w === 'string' && w.indexOf('user:') === 0) {
				const id = w.slice(5)
				const found = loadWallpapers().find((item) => item.id === id)
				if (found) return { url: found.dataUrl, name: found.name }
			}
			return null
		}

		function currentScheme() {
			return document.body && document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
		}

		/** 壁纸固定层（z-index:-1），懒创建；参考 dsh-dream-skin 的单层方案 */
		let wallpaperEl = null

		/**
		 * 应用壁纸：单个固定 div 垫底（cover + 遮罩 + 可选 blur），body 挂
		 * jarvis-wallpaper 类供 backdrop-filter 规则使用。
		 * @returns 壁纸是否激活（true = 需要半透明表面）
		 */
		function applyWallpaper(settings, scheme) {
			if (!document || !document.body) return false
			const wp = wallpaperInfo(settings)
			const active = !!wp
			document.body.classList.toggle('jarvis-wallpaper', active)
			if (!active) {
				if (wallpaperEl && wallpaperEl.parentNode) wallpaperEl.parentNode.removeChild(wallpaperEl)
				wallpaperEl = null
				return false
			}
			if (wallpaperEl === null || !document.body.contains(wallpaperEl)) {
				wallpaperEl = document.createElement('div')
				wallpaperEl.id = 'jarvis-wallpaper'
				wallpaperEl.style.cssText =
					'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover,cover;background-position:center;background-repeat:no-repeat;'
				if (document.body.prepend) document.body.prepend(wallpaperEl)
				else document.body.appendChild(wallpaperEl)
			}
			const isLight = (scheme || currentScheme()) === 'light'
			// 遮罩叠加在壁纸上，保证文字可读性；暗色重、亮色轻
			const scrim = isLight ? 'rgba(240, 247, 255, 0.30)' : 'rgba(2, 8, 16, 0.38)'
			const url = wp.url.replace(/"/g, '%22')
			wallpaperEl.style.backgroundImage =
				'linear-gradient(' + scrim + ',' + scrim + '), url("' + url + '")'
			const blur = Number(settings && settings.wallpaperBlur) || 0
			wallpaperEl.style.filter = blur > 0 ? 'blur(' + blur + 'px)' : 'none'
			return true
		}

		/** 移除壁纸层（效果清理用） */
		function teardownWallpaper() {
			if (wallpaperEl && wallpaperEl.parentNode) wallpaperEl.parentNode.removeChild(wallpaperEl)
			wallpaperEl = null
			if (document && document.body) document.body.classList.remove('jarvis-wallpaper')
		}

		// ── 图片压缩（参考 dsh-dream-skin）：canvas 降采样 + JPEG ────────
		/** 把图片画到 canvas 上降采样，返回 JPEG dataURL；尺寸异常时返回 null（调用方回退原始图）。 */
		function compressImage(image, maxSide, quality) {
			const w = image && image.width ? image.width : 0
			const h = image && image.height ? image.height : 0
			if (!w || !h) return null
			const scale = Math.min(1, maxSide / Math.max(w, h))
			const canvas = document.createElement('canvas')
			canvas.width = Math.max(1, Math.round(w * scale))
			canvas.height = Math.max(1, Math.round(h * scale))
			const context = canvas.getContext('2d')
			context.drawImage(image, 0, 0, canvas.width, canvas.height)
			return canvas.toDataURL('image/jpeg', quality)
		}

		/**
		 * 读取选择的图片 → 压缩为 dataURL（≤2MB）。最大 1600px / JPEG 0.75，
		 * 超限逐级降 1000/0.6、800/0.5；canvas 不可用时退回原始 dataURL。
		 */
		function readImageAsDataUrl(file, onDone) {
			const fallback = (dataUrl) => onDone(dataUrl)
			const reader = new FileReader()
			reader.onerror = () => onDone(null)
			reader.onload = () => {
				try {
					const raw = String(reader.result || '')
					if (typeof Image === 'undefined' || typeof document.createElement('canvas').getContext !== 'function') {
						fallback(raw)
						return
					}
					const image = new Image()
					image.onerror = () => fallback(raw)
					image.onload = () => {
						try {
							let dataUrl = compressImage(image, 1600, 0.75)
							if (dataUrl && dataUrl.length > WALLPAPER_DATA_LIMIT) dataUrl = compressImage(image, 1000, 0.6)
							if (dataUrl && dataUrl.length > WALLPAPER_DATA_LIMIT) dataUrl = compressImage(image, 800, 0.5)
							onDone(dataUrl || raw) // 压缩失败（异常尺寸）→ 用原始 dataURL
						} catch {
							fallback(raw)
						}
					}
					image.src = raw
				} catch {
					fallback(String(reader.result || ''))
				}
			}
			reader.readAsDataURL(file)
		}

		// ── 颜色工具：hex/rgb(a) → 乘 alpha 的 rgba ───────────────────
		function parseColor(input) {
			const s = String(input == null ? '' : input).trim()
			if (!s) return null
			let m = s.match(/^#([0-9a-f]{6})$/i)
			if (m) {
				return {
					r: parseInt(m[1].slice(0, 2), 16),
					g: parseInt(m[1].slice(2, 4), 16),
					b: parseInt(m[1].slice(4, 6), 16),
					a: 1,
				}
			}
			m = s.match(/^#([0-9a-f]{3})$/i)
			if (m) {
				const h = m[1]
				return {
					r: parseInt(h[0] + h[0], 16),
					g: parseInt(h[1] + h[1], 16),
					b: parseInt(h[2] + h[2], 16),
					a: 1,
				}
			}
			m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
			if (m) {
				return {
					r: Math.max(0, Math.min(255, Number(m[1]))),
					g: Math.max(0, Math.min(255, Number(m[2]))),
					b: Math.max(0, Math.min(255, Number(m[3]))),
					a: m[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(m[4]))),
				}
			}
			return null
		}

		/** 把任意颜色乘上 alpha 倍率（透明度只降不升，alpha 保留 3 位小数） */
		function alphaColor(input, alpha) {
			const c = parseColor(input)
			if (!c) return input
			const a = Math.round(Math.max(0, Math.min(1, c.a * alpha)) * 1000) / 1000
			return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ', ' + a + ')'
		}

		/** 壁纸激活时做半透明的表面 token 及其目标 alpha（文字/边框保持不透明） */
		const WALLPAPER_SURFACE_ALPHAS = Object.freeze({
			'--dsw-alias-bg-base': 0.78,
			'--dsw-alias-bg-layer-1': 0.66,
			'--dsw-alias-bg-layer-2': 0.58,
			'--dsw-alias-bg-layer-3': 0.52,
			'--dsw-alias-bg-overlay': 0.62,
			'--dsw-alias-bg-module-platform': 0.55,
			'--dsw-alias-bg-multi-select': 0.55,
			'--dsw-alias-button-elevated-fill': 0.5,
			'--dsw-alias-button-floating-fill': 0.5,
			'--dsw-alias-button-floating-hover': 0.62,
			'--dsw-alias-button-ghost-active-fill': 0.5,
			'--dsw-alias-button-ghost-active-hover': 0.58,
			'--dsw-alias-markdown-code-block': 0.6,
			'--dsw-alias-markdown-code-block-banner': 0.55,
			'--dsw-alias-markdown-inline-code': 0.55,
			'--dsw-alias-markdown-placeholder': 0.5,
			'--dsw-alias-markdown-tag': 0.5,
			'--dsw-alias-markdown-citation': 0.5,
			'--dsw-alias-markdown-code-segment-selected': 0.55,
			'--dsw-alias-markdown-code-segment-unselected': 0.5,
			'--dsw-alias-toast-bg': 0.72,
			'--dsw-alias-tooltip-bg': 0.78,
			'--dsw-specific-bubble': 0.6,
			'--dsw-specific-bubble-highlight': 0.55,
			'--dsw-specific-input-major': 0.6,
			'--dsw-specific-login-input': 0.6,
			'--dsw-specific-menu': 0.62,
			'--dsw-specific-selector': 0.6,
			'--dsw-specific-sidebar-fill': 0.66,
			'--dsw-specific-sidebar-nav-item-active': 0.55,
			'--dsw-specific-sidebar-nav-item-hover': 0.5,
		})

		// ───────────────────────────────────────────────────────────────
		// 主题与特效应用
		// ───────────────────────────────────────────────────────────────

		function resolveThemeId(mode) {
			if (mode === 'light') return THEME_LIGHT
			if (mode === 'system') {
				// 跟随系统 = 交还内置 system 偏好（durable），常驻 override 层
				// 会按当前配色自动给对应贾维斯色板。
				return 'system'
			}
			return THEME_DARK
		}

		function setTheme(ctx, mode) {
			try {
				ctx.theme.setTheme(resolveThemeId(mode))
			} catch (err) {
				console.error('[dsh-theme-jarvis] setTheme failed:', err)
			}
		}

		/** 最近一次生效设置（apply / 控制台 onChange 都会更新），供
		 * theme/change 再断言监听器判断是否需要重新夺取主题。 */
		let currentSettings = { ...DEFAULT_SETTINGS }
		// 运行时 ctx 镜像：供 settings.general.item 外观行等组件调用
		// applySettings（slot 组件在 apply 之后才挂载，ctx 已就绪）。
		let runtimeCtx = null
		// 宠物实例镜像：applySettings 需要把 petForm 变更即时推给画布
		let activePet = null
		// 常驻 override 层（同一 source 重复调用会整层替换，旧的 disposer
		// 自动变 no-op）：清理时释放最新一层。
		let overrideDisposer = null
		// 壁纸层状态镜像（开/关 × 不透明度）：变化时重建 override 层
		let lastWallpaperKey = null

		/**
		 * 常驻 override 层：{ token: { light, dark } } 全量配对。
		 * 壁纸激活时对表面 token 乘 alpha（半透明毛玻璃），opacity 为
		 * 全局不透明度倍率（0.2..1，1 = 出厂调校），其余保持原样。
		 */
		function buildOverrideTokens(wallpaperOn, opacity) {
			const pairs = {}
			const translucent = !!wallpaperOn
			const wash = Number.isFinite(opacity) ? Math.min(1, Math.max(0.2, opacity)) : 1
			for (const name of Object.keys(DARK_TOKENS)) {
				let light = LIGHT_TOKENS[name]
				let dark = DARK_TOKENS[name]
				if (translucent && Object.prototype.hasOwnProperty.call(WALLPAPER_SURFACE_ALPHAS, name)) {
					const alpha = Math.min(1, WALLPAPER_SURFACE_ALPHAS[name] * wash)
					light = alphaColor(light, alpha)
					dark = alphaColor(dark, alpha)
				}
				pairs[name] = { light, dark }
			}
			return pairs
		}

		function applySettings(ctx, settings) {
			currentSettings = settings
			setTheme(ctx, settings.mode)
			document.body.classList.toggle('jarvis-scanlines', !!settings.scanlines)
			document.body.classList.toggle('jarvis-glow', !!settings.glow)
			document.body.classList.toggle('jarvis-pet-on', !!settings.pet)
			if (activePet) activePet.setForm(settings.petForm || 'jarvis')
			// 壁纸：固定 div 垫底 + 遮罩/模糊；开/关或不透明度变化时重建
			// 半透明 override 层（同一 source 调用会整层替换）。
			const wallpaperOn = applyWallpaper(settings)
			const opacity = Number(settings && settings.wallpaperOpacity) || WALLPAPER_DEFAULT_OPACITY
			const key = (wallpaperOn ? '1:' + opacity : '0')
			if (key !== lastWallpaperKey) {
				lastWallpaperKey = key
				if (ctx && ctx.theme && typeof ctx.theme.overrideTokens === 'function') {
					try {
						overrideDisposer = ctx.theme.overrideTokens(
							'dsh-theme-jarvis',
							buildOverrideTokens(wallpaperOn, opacity),
						)
					} catch (err) {
						console.error('[dsh-theme-jarvis] overrideTokens failed:', err)
					}
				}
			}
			// 语音唤醒：设置面板每次变更都同步给引擎（开关 / 唤醒词即时生效）
			wakeEngine.configure(settings)
			// 打字音效开关同步（供 keydown 监听器判断）
			typingSfxEnabled = settings.typingSfx !== false
		}

		function prefersReducedMotion() {
			return (
				typeof window !== 'undefined' &&
				window.matchMedia &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches
			)
		}

		function ensureFxDom() {
			if (document.getElementById('jarvis-scanlines')) return
			const scanlines = document.createElement('div')
			scanlines.id = 'jarvis-scanlines'
			const vignette = document.createElement('div')
			vignette.id = 'jarvis-vignette'
			const hud = document.createElement('div')
			hud.id = 'jarvis-wake-hud'
			hud.innerHTML =
				'<div class="jh-title">J.A.R.V.I.S.</div><div class="jh-text" style="display:none"></div>'
			const host = document.body || document.documentElement
			host.appendChild(scanlines)
			host.appendChild(vignette)
			host.appendChild(hud)
		}

		function injectStyles() {
			const old = document.getElementById(FX_STYLE_ID)
			if (old) old.remove()
			const style = document.createElement('style')
			style.id = FX_STYLE_ID
			style.textContent = FX_CSS + JARVIS_TREE_CSS
			;(document.head || document.documentElement).appendChild(style)
		}

		function playBoot() {
			if (prefersReducedMotion() || !document.body) return
			const old = document.getElementById('jarvis-boot')
			if (old) old.remove()
			const boot = document.createElement('div')
			boot.id = 'jarvis-boot'
			boot.innerHTML = [
				'<div class="jb-line"></div>',
				'<div class="jb-title">J.A.R.V.I.S.</div>',
				'<div class="jb-sub">STARK INDUSTRIES</div>',
				'<div class="jb-log" style="animation-delay:.35s">&gt; INITIALIZING DEEPSEEK HARNESS INTERFACE ...</div>',
				'<div class="jb-log" style="animation-delay:.9s">&gt; ARC REACTOR ONLINE · ALL SYSTEMS NOMINAL</div>',
				'<div class="jb-log" style="animation-delay:1.45s">&gt; AT YOUR SERVICE, SIR.</div>',
			].join('')
			boot.addEventListener('animationend', () => boot.remove())
			document.body.appendChild(boot)
		}

		// ───────────────────────────────────────────────────────────────
		// ───────────────────────────────────────────────────────────────
		// JARVIS 全息粒子宠物（右下角 canvas，复刻《奥创纪元》双 AI 光效）
		//
		// 贾维斯形态（默认）：暖金闭合环流粒子球 —— 五道不同倾角的密排
		// 粒子环 + 五条经线弧编织成收敛球笼，核心柔光呼吸，环带上有
		// 「数据流彗星」沿环巡行；运动平稳、结构有序。
		// 奥创形态：电光蓝人形混沌网 —— 头/肩/胸/臂锚点逐帧抖动，枝杈
		// 丝线向外无序迸发、细碎电光碎片高频闪烁、随机电弧炸闪；形态
		// 躁动、发散、充满侵略性。petForm=auto 时错误态自动化身奥创。
		// 能量值由实时状态驱动：流式输出加速高亮、语音聆听脉冲、错误
		// 告警高能、空闲缓慢呼吸。点击弹跳 + 溅射；可拖动（内存态）。
		// 尊重 reduced-motion（静止一帧）与小屏（隐藏）。
		// ───────────────────────────────────────────────────────────────
		function startPet() {
			const canvas = document.createElement('canvas')
			canvas.id = 'jarvis-pet'
			canvas.width = 156
			canvas.height = 156
			const g = canvas.getContext('2d')
			const host = document.body || document.documentElement
			host.appendChild(canvas)

			const W = canvas.width
			const H = canvas.height
			const CX = W / 2
			const CY = H / 2
			const TAU = Math.PI * 2

			// ── 贾维斯形态：闭合环流粒子球 ─────────────────────────────
			// 五道不同倾角的环（inc=倾角），密排粒子、相邻连线成闭合环；
			// 每条环带一个「数据流彗星」亮点沿环巡行。
			const ORBITS = [
				{ inc: 0.22, radius: 62, count: 48, speed: 0.5, phase: 0.0, flow: 1.1 },
				{ inc: 0.62, radius: 58, count: 48, speed: -0.38, phase: 1.7, flow: -1.5 },
				{ inc: 1.0, radius: 53, count: 46, speed: 0.3, phase: 3.1, flow: 1.9 },
				{ inc: 1.34, radius: 46, count: 42, speed: -0.24, phase: 4.4, flow: -2.3 },
				{ inc: 1.56, radius: 38, count: 38, speed: 0.18, phase: 5.6, flow: 2.7 },
			]
			const MERIDIAN_COUNT = 5
			const MERIDIAN_POINTS = 34
			const orbitParticles = ORBITS.flatMap((orbit, orbitIndex) =>
				Array.from({ length: orbit.count }, (_, i) => ({
					orbit: orbitIndex,
					angle: (i / orbit.count) * TAU,
					twinkle: Math.random() * TAU,
				})),
			)
			// 漂浮星尘（金色细屑，缓慢上浮）
			const DUST_COUNT = 14
			const dust = Array.from({ length: DUST_COUNT }, () => ({
				x: Math.random() * W,
				y: Math.random() * H,
				vy: 0.06 + Math.random() * 0.2,
				sway: Math.random() * TAU,
				size: 0.5 + Math.random() * 1.1,
				twinkle: Math.random() * TAU,
			}))

			// ── 奥创形态：人形混沌网 ─────────────────────────────────
			// 头/肩/胸/臂的锚点骨架（逐帧抖动），枝杈丝线向外迸发，
			// 细碎电光碎片闪烁，随机电弧炸闪。
			const ULTRON_ANCHORS = [
				{ x: CX, y: CY - 17 }, // 头
				{ x: CX - 14, y: CY - 1 }, // 左肩
				{ x: CX + 14, y: CY - 1 }, // 右肩
				{ x: CX, y: CY + 13 }, // 胸
				{ x: CX - 25, y: CY + 9 }, // 左臂
				{ x: CX + 25, y: CY + 9 }, // 右臂
				{ x: CX - 20, y: CY + 24 }, // 左下
				{ x: CX + 20, y: CY + 24 }, // 右下
			]
			const FILAMENTS = []
			const filamentSeeds = [
				[0, -1.35], [0, -2.1], [0, 2.6], [0, 1.1],
				[1, -1.8], [1, -0.9], [1, 2.9], [2, -2.9], [2, -1.2], [2, 0.7],
				[3, 0.2], [3, 2.4], [3, -2.6], [4, 0.6], [4, 1.5], [5, -1.5], [5, -0.6],
				[6, 0.9], [7, -0.9],
			]
			filamentSeeds.forEach(([anchorIndex, angle], i) => {
				FILAMENTS.push({
					anchor: anchorIndex,
					angle,
					baseLen: 24 + ((i * 37) % 24),
					phase: i * 1.31,
					speed: 1.6 + ((i * 13) % 10) * 0.2,
					segs: 6 + (i % 4),
					twigs: [0.45, 0.75],
				})
			})
			const FRAGMENT_COUNT = 26
			const fragments = Array.from({ length: FRAGMENT_COUNT }, (_, i) => {
				const f = FILAMENTS[i % FILAMENTS.length]
				return {
					filament: i % FILAMENTS.length,
					along: 0.6 + ((i * 29) % 100) / 100 * 0.5,
					offAngle: ((i * 61) % 100) / 100 * TAU,
					twinkle: Math.random() * TAU,
					size: 0.5 + Math.random() * 1.2,
				}
			})
			const arcs = [] // { ax, ay, bx, by, life, maxLife }
			const sparks = [] // 共享溅射池 { x, y, vx, vy, life, maxLife, size }

			const state = {
				voice: 'off',
				streaming: false,
				error: false,
				scheme: 'dark',
				energy: 0.35,
				tokenHeat: 0, // 0..1：实时 token 消耗发热（球体颜色随其偏移）
				contextPercent: 0, // 0..100：上下文使用率（≥80 持续警报红）
				flashColor: null, // 请求进行中的随机跳变色
				flashAt: 0,
				nextFlashAt: 0,
				bounce: 0,
				pointer: { down: false, x: 0, y: 0, moved: false },
			}
			let petFormSetting = 'jarvis' // jarvis | ultron | auto

			let raf = null
			let t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
			let lastNow = t0
			let disposed = false
			let sparkAcc = 0
			let arcAcc = 0
			const reduced = prefersReducedMotion()

			function resolveForm() {
				if (petFormSetting === 'ultron') return 'ultron'
				if (petFormSetting === 'auto') return state.error ? 'ultron' : 'jarvis'
				return 'jarvis'
			}

			function targetEnergy() {
				if (state.error) return 1.7
				if (state.streaming) return 1.35
				if (state.voice === 'recording') return 1.2
				if (state.voice === 'armed' || state.voice === 'uploading') return 1.05
				if (state.voice === 'sleeping') return 0.7
				return 0.35
			}

			/** 形态色板：贾维斯暖金 / 奥创电光蓝 / 错误态警报红。 */
			function formPalette(form) {
				const dark = state.scheme !== 'light'
				if (form === 'ultron') {
					return {
						core: [77, 141, 255],
						hot: '173, 203, 255',
						line: dark ? '96, 156, 255' : '37, 99, 214',
						glow: 'rgba(77, 141, 255, 0.55)',
					}
				}
				if (state.error) {
					return {
						core: [255, 92, 84],
						hot: '255, 170, 130',
						line: dark ? '255, 92, 84' : '214, 60, 54',
						glow: 'rgba(255, 92, 84, 0.5)',
					}
				}
				return {
					core: [255, 202, 96],
					hot: '255, 236, 190',
					line: dark ? '245, 179, 60' : '199, 123, 18',
					glow: 'rgba(245, 179, 60, 0.5)',
				}
			}

			/** 伪随机噪声：无状态、逐帧稳定抖动。 */
			function jitter(seed, t) {
				return Math.sin(seed * 12.9898 + t * 1.7) * 0.5 + Math.sin(seed * 78.233 + t * 2.3) * 0.5
			}

			/** 通用色板着色：把 core/line/hot/glow 按 k(0..1) 向目标色混合。 */
			function tintPalette(pal, target, k) {
				const blend = Math.max(0, Math.min(1, k))
				if (blend <= 0.01) return pal
				const mixArr = (c) => [
					Math.round(c[0] + (target[0] - c[0]) * blend),
					Math.round(c[1] + (target[1] - c[1]) * blend),
					Math.round(c[2] + (target[2] - c[2]) * blend),
				]
				const core = mixArr(pal.core)
				const lineArr = Array.isArray(pal.line)
					? pal.line
					: String(pal.line).split(',').map((s) => Number(s.trim()))
				return {
					core,
					hot: core.join(', '),
					line: mixArr(lineArr).join(', '),
					glow: 'rgba(' + core.join(',') + ', 0.6)',
				}
			}

			/**
			 * 发热偏色：把整副形态色板向「白热红」偏移（非线性 h² ——
			 * 低热几乎不动，高热迅速拉满），让 token 消耗导致的变色
			 * 覆盖整只宠物（轨道/丝线/碎片/膜/球体全部跟随）。
			 */
			function heatTintPalette(pal, heat) {
				const h = Math.max(0, Math.min(1, Number(heat) || 0))
				if (h <= 0.02) return pal
				return tintPalette(pal, [255, 92, 64], h * h)
			}

			/** 请求进行中随机跳变用的候选色（方舟青/品红/翠绿/琥珀/紫/红/金/亮白）。 */
			const FLASH_COLORS = [
				[59, 220, 244],
				[255, 77, 216],
				[47, 232, 160],
				[255, 161, 60],
				[167, 139, 250],
				[255, 92, 84],
				[255, 210, 76],
				[232, 246, 255],
			]
			function pickFlashColor(prev) {
				let idx = Math.floor(Math.random() * FLASH_COLORS.length)
				if (prev && FLASH_COLORS.length > 1) {
					const prevIdx = FLASH_COLORS.findIndex(
						(c) => c[0] === prev[0] && c[1] === prev[1] && c[2] === prev[2],
					)
					if (idx === prevIdx) idx = (idx + 1) % FLASH_COLORS.length
				}
				return FLASH_COLORS[idx]
			}

			/** 外部推送实时 token 消耗发热（平滑收敛）。 */
			function setTokenHeat(heat) {
				const target = Math.max(0, Math.min(1, Number(heat) || 0))
				state.tokenHeat += (target - state.tokenHeat) * 0.5
			}

			/** 外部推送上下文使用率（0..100）：≥80 时宠物保持警报红。 */
			function setContextPercent(pct) {
				const v = Number(pct)
				state.contextPercent = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0
			}

			// ═════════════════════════════════════════════════════════
			// 贾维斯形态绘制
			// ═════════════════════════════════════════════════════════

			function jarvisOrbitPoint(p, t, orbit, energy) {
				const spin = p.angle + t * orbit.speed * (0.6 + energy * 0.8) + orbit.phase
				const breathe = 1 + Math.sin(t * 1.2) * 0.012 * energy
				const radius = orbit.radius * breathe * (state.bounce > 0.01 ? 1 + state.bounce * 0.12 : 1)
				const x = CX + Math.cos(spin) * radius
				const y = CY + Math.sin(spin) * radius * Math.sin(orbit.inc)
				const depth = (Math.sin(spin) + 1) / 2
				return { x, y, depth, spin }
			}

			function drawJarvisOrbits(t, pal, energy, front) {
				g.save()
				g.globalCompositeOperation = 'lighter'
				for (const orbit of ORBITS) {
					const orbitIndex = ORBITS.indexOf(orbit)
					const pts = orbitParticles
						.filter((p) => p.orbit === orbitIndex)
						.map((p) => ({ p, pos: jarvisOrbitPoint(p, t, orbit, energy) }))
						.filter((entry) => (entry.pos.depth > 0.5) === front)
					// 闭合环线：相邻点连线（含首尾闭环）
					g.strokeStyle = 'rgba(' + pal.line + ',0.5)'
					g.lineWidth = 0.7
					for (let i = 0; i < pts.length; i++) {
						const a = pts[i].pos
						const b = pts[(i + 1) % pts.length].pos
						g.globalAlpha = 0.16 + (front ? a.depth * 0.3 : (1 - a.depth) * 0.3) * 0.5
						g.beginPath()
						g.moveTo(a.x, a.y)
						g.lineTo(b.x, b.y)
						g.stroke()
					}
					// 数据流彗星：沿环巡行的亮段
					const flowHead = t * orbit.flow * (0.8 + energy * 0.6)
					for (const entry of pts) {
						const d = Math.abs(Math.atan2(Math.sin(entry.pos.spin - flowHead), Math.cos(entry.pos.spin - flowHead)))
						if (d > 0.55) continue
						const k = 1 - d / 0.55
						g.globalAlpha = k * 0.8
						g.fillStyle = 'rgba(' + pal.hot + ',1)'
						g.beginPath()
						g.arc(entry.pos.x, entry.pos.y, 0.8 + k * 1.4, 0, TAU)
						g.fill()
					}
				}
				g.restore()
			}

			function drawJarvisMeridians(t, pal, energy, front) {
				g.save()
				g.globalCompositeOperation = 'lighter'
				const breathe = 1 + Math.sin(t * 1.2) * 0.012 * energy
				const R = 30 * breathe * (state.bounce > 0.01 ? 1 + state.bounce * 0.12 : 1)
				for (let k = 0; k < MERIDIAN_COUNT; k++) {
					const beta = t * 0.16 * (0.6 + energy * 0.8) + (k / MERIDIAN_COUNT) * TAU
					const rx = R * Math.abs(Math.cos(beta))
					const frontOf = (theta) => Math.cos(theta) * Math.cos(beta) > 0
					g.strokeStyle = 'rgba(' + pal.line + ',0.45)'
					g.lineWidth = 0.6
					g.beginPath()
					let started = false
					for (let i = 0; i <= MERIDIAN_POINTS; i++) {
						const theta = (i / MERIDIAN_POINTS) * TAU - Math.PI / 2
						const x = CX + Math.cos(theta) * rx * Math.sign(Math.cos(beta) || 1)
						const y = CY + Math.sin(theta) * R
						if (frontOf(theta) !== front) {
							if (started) {
								g.globalAlpha = front ? 0.3 : 0.1
								g.stroke()
								started = false
							}
							g.beginPath()
							continue
						}
						if (!started) {
							g.moveTo(x, y)
							started = true
						} else g.lineTo(x, y)
					}
					if (started) {
						g.globalAlpha = front ? 0.3 : 0.1
						g.stroke()
					}
				}
				g.restore()
			}

			function drawJarvisCore(t, pal, energy, heat) {
				const h = Math.max(0, Math.min(1, Number(heat) || 0))
				// 色板已被 heatTintPalette 整体偏色（金 → 白热红）
				const pulse = 1 + Math.sin(t * 1.8) * 0.05 * energy
				const R = 15 * pulse * (1 + h * 0.3) * (state.bounce > 0.01 ? 1 + state.bounce * 0.12 : 1)
				g.save()
				g.shadowColor = pal.glow
				g.shadowBlur = (12 + energy * 16) * (1 + h * 1.1)
				const grad = g.createRadialGradient(CX, CY, 0, CX, CY, R * 1.6)
				grad.addColorStop(0, 'rgba(255, 255, 250, ' + (0.95 + h * 0.05) + ')')
				grad.addColorStop(0.25, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.9)')
				grad.addColorStop(0.65, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.3)')
				grad.addColorStop(1, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0)')
				g.fillStyle = grad
				g.beginPath()
				g.arc(CX, CY, R * 1.6, 0, TAU)
				g.fill()
				// 高热时加一圈红色过载晕
				if (h > 0.45) {
					g.globalAlpha = (h - 0.45) * 1.2
					g.strokeStyle = 'rgba(255, 70, 50, 0.9)'
					g.lineWidth = 2
					g.beginPath()
					g.arc(CX, CY, R * (1.9 + (h - 0.45) * 0.5), 0, TAU)
					g.stroke()
				}
				g.restore()
			}

			// ═════════════════════════════════════════════════════════
			// 奥创形态绘制
			// ═════════════════════════════════════════════════════════

			function ultronAnchors(t) {
				return ULTRON_ANCHORS.map((a, i) => ({
					x: a.x + jitter(i * 3.1, t) * 1.6,
					y: a.y + jitter(i * 5.7 + 9, t) * 1.6,
				}))
			}

			function drawUltronFilaments(t, pal, energy) {
				const anchors = ultronAnchors(t)
				g.save()
				g.globalCompositeOperation = 'lighter'
				for (const f of FILAMENTS) {
					const anchor = anchors[f.anchor]
					const extend = 1 + energy * 0.5 + 0.16 * Math.sin(t * f.speed + f.phase)
					const len = f.baseLen * extend
					const flicker = 0.45 + 0.4 * Math.sin(t * 9.1 + f.phase) + energy * 0.15
					const endX = anchor.x + Math.cos(f.angle) * len
					const endY = anchor.y + Math.sin(f.angle) * len * 0.8
					// 主干：逐段抖动的折线
					g.strokeStyle = 'rgba(' + pal.line + ',1)'
					g.lineWidth = 0.9
					g.globalAlpha = Math.max(0.12, Math.min(0.85, flicker))
					g.beginPath()
					g.moveTo(anchor.x, anchor.y)
					const segs = f.segs
					for (let s = 1; s <= segs; s++) {
						const k = s / segs
						const jx = jitter(f.phase * 7 + s * 3.3, t) * 3.2 * k
						const jy = jitter(f.phase * 11 + s * 5.1, t + 3) * 3.2 * k
						g.lineTo(anchor.x + (endX - anchor.x) * k + jx, anchor.y + (endY - anchor.y) * k + jy)
					}
					g.stroke()
					// 枝杈
					for (const along of f.twigs) {
						const bx = anchor.x + (endX - anchor.x) * along
						const by = anchor.y + (endY - anchor.y) * along
						const twigAngle = f.angle + (along > 0.6 ? 0.7 : -0.7) + jitter(f.phase + along * 9, t) * 0.5
						const twigLen = 7 + 5 * Math.sin(t * f.speed * 1.3 + f.phase + along * 5)
						g.globalAlpha = Math.max(0.1, flicker * 0.7)
						g.beginPath()
						g.moveTo(bx, by)
						g.lineTo(bx + Math.cos(twigAngle) * twigLen, by + Math.sin(twigAngle) * twigLen * 0.7)
						g.stroke()
					}
				}
				g.restore()
			}

			function drawUltronFragments(t, pal, energy) {
				const anchors = ultronAnchors(t)
				g.save()
				g.globalCompositeOperation = 'lighter'
				for (const fr of fragments) {
					const f = FILAMENTS[fr.filament]
					const anchor = anchors[f.anchor]
					const len = f.baseLen * (1 + energy * 0.5 + 0.16 * Math.sin(t * f.speed + f.phase))
					const bx = anchor.x + Math.cos(f.angle) * len * fr.along
					const by = anchor.y + Math.sin(f.angle) * len * 0.8 * fr.along
					const x = bx + Math.cos(fr.offAngle) * 5
					const y = by + Math.sin(fr.offAngle) * 3.5
					const flash = Math.pow(Math.max(0, Math.sin(t * 7.3 + fr.twinkle)), 6)
					g.globalAlpha = 0.1 + flash * 0.85 + energy * 0.1
					g.fillStyle = 'rgba(' + pal.hot + ',1)'
					g.beginPath()
					g.arc(x, y, fr.size * (0.7 + flash * 0.9), 0, TAU)
					g.fill()
				}
				g.restore()
			}

			function drawUltronCore(t, pal, energy) {
				const anchors = ultronAnchors(t)
				const head = anchors[0]
				const chest = anchors[3]
				g.save()
				g.globalCompositeOperation = 'lighter'
				// 头部高亮核（明暗对比强烈）
				const flicker = 0.8 + 0.2 * Math.sin(t * 11.3)
				const grad = g.createRadialGradient(head.x, head.y, 0, head.x, head.y, 16)
				grad.addColorStop(0, 'rgba(240, 246, 255, ' + 0.95 * flicker + ')')
				grad.addColorStop(0.4, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.75)')
				grad.addColorStop(1, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0)')
				g.fillStyle = grad
				g.beginPath()
				g.arc(head.x, head.y, 16 + energy * 3, 0, TAU)
				g.fill()
				// 胸核
				const grad2 = g.createRadialGradient(chest.x, chest.y, 0, chest.x, chest.y, 12)
				grad2.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
				grad2.addColorStop(1, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0)')
				g.fillStyle = grad2
				g.beginPath()
				g.arc(chest.x, chest.y, 12, 0, TAU)
				g.fill()
				// 锚点节点（神经网络突触）
				g.fillStyle = 'rgba(' + pal.hot + ',0.9)'
				for (let i = 0; i < anchors.length; i++) {
					const a = anchors[i]
					const k = 0.6 + 0.4 * Math.sin(t * 6.7 + i * 2.4)
					g.globalAlpha = k
					g.beginPath()
					g.arc(a.x, a.y, 1.3 + energy * 0.5, 0, TAU)
					g.fill()
				}
				g.restore()
			}

			/** 奥创中央球体：电光蓝核 + 表面裂纹 + 亮环；色板已随发热整体偏色。 */
			function drawUltronSphere(t, pal, energy, heat) {
				const h = Math.max(0, Math.min(1, Number(heat) || 0))
				const flick = 1 + Math.sin(t * 9.7) * 0.05 * (0.5 + energy) + jitter(13, t) * 0.03
				const R = 13 * flick * (1 + h * 0.25) * (state.bounce > 0.01 ? 1 + state.bounce * 0.1 : 1)
				g.save()
				g.globalCompositeOperation = 'lighter'
				g.shadowColor = pal.glow
				g.shadowBlur = (10 + energy * 18) * (1 + h * 1.1)
				const grad = g.createRadialGradient(CX, CY, 0, CX, CY, R * 1.55)
				grad.addColorStop(0, 'rgba(235, 248, 255, ' + (0.92 + h * 0.08) + ')')
				grad.addColorStop(0.3, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.9)')
				grad.addColorStop(0.7, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.35)')
				grad.addColorStop(1, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0)')
				g.fillStyle = grad
				g.beginPath()
				g.arc(CX, CY, R * 1.55, 0, TAU)
				g.fill()
				// 表面裂纹：绕球旋转的锯齿电光短线（越热越亮越密）
				const cracks = 5
				for (let i = 0; i < cracks; i++) {
					const a0 = t * (1.6 + i * 0.23) + i * (TAU / cracks)
					g.strokeStyle = 'rgba(' + pal.hot + ',0.95)'
					g.lineWidth = 1
					g.globalAlpha = Math.min(1, 0.4 + 0.6 * Math.abs(Math.sin(t * 13 + i * 2.2)) + h * 0.4)
					g.beginPath()
					g.moveTo(CX + Math.cos(a0) * R * 0.7, CY + Math.sin(a0) * R * 0.7)
					const segs = 3
					for (let s = 1; s <= segs; s++) {
						const k = s / segs
						const ja = a0 + (Math.random() - 0.5) * 0.7
						const rr = R * (0.7 + 0.55 * k)
						g.lineTo(CX + Math.cos(ja) * rr, CY + Math.sin(ja) * rr)
					}
					g.stroke()
				}
				// 亮环
				g.globalAlpha = Math.min(1, 0.45 + 0.3 * Math.sin(t * 6.1) + h * 0.3)
				g.strokeStyle = 'rgba(' + pal.line + ',0.95)'
				g.lineWidth = 1.2
				g.beginPath()
				g.arc(CX, CY, R * 1.15, 0, TAU)
				g.stroke()
				// 高热时红色过载晕
				if (h > 0.45) {
					g.globalAlpha = (h - 0.45) * 1.2
					g.strokeStyle = 'rgba(255, 70, 50, 0.9)'
					g.lineWidth = 2
					g.beginPath()
					g.arc(CX, CY, R * (1.85 + (h - 0.45) * 0.5), 0, TAU)
					g.stroke()
				}
				g.restore()
			}

			/** 奥创外圈能量膜：半透明气泡 + 有机抖动的边界线，包裹整个混沌网。 */
			function drawUltronMembrane(t, pal, energy, heat) {
				const h = Math.max(0, Math.min(1, Number(heat) || 0))
				const pulse = 1 + Math.sin(t * 2.3) * 0.02 * (0.5 + energy) + jitter(29, t) * 0.015
				const rx = 64 * pulse * (1 + h * 0.08)
				const ry = 56 * pulse * (1 + h * 0.08)
				g.save()
				g.globalCompositeOperation = 'lighter'
				// 内部充能填充（极低透明度，气泡感）
				const grad = g.createRadialGradient(CX, CY, 0, CX, CY, rx)
				grad.addColorStop(0, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.04)')
				grad.addColorStop(0.75, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.06)')
				grad.addColorStop(1, 'rgba(' + pal.core[0] + ',' + pal.core[1] + ',' + pal.core[2] + ',0.16)')
				g.fillStyle = grad
				g.beginPath()
				g.ellipse(CX, CY, rx, ry, 0, 0, TAU)
				g.fill()
				// 膜边界：逐段抖动的不规则椭圆（有机能量膜，越热越亮）
				g.strokeStyle = 'rgba(' + pal.line + ',0.55)'
				g.lineWidth = 1.3
				g.globalAlpha = Math.min(1, 0.45 + 0.2 * Math.sin(t * 4.1) + h * 0.35)
				g.beginPath()
				const SEGS = 26
				for (let i = 0; i <= SEGS; i++) {
					const a = (i / SEGS) * TAU
					const wob = 1 + jitter(i * 3.3 + 17, t) * 0.04 + energy * 0.025
					const x = CX + Math.cos(a) * rx * wob
					const y = CY + Math.sin(a) * ry * wob
					if (i === 0) g.moveTo(x, y)
					else g.lineTo(x, y)
				}
				g.closePath()
				g.stroke()
				g.restore()
			}

			/** 随机电光弧：两点间锯齿折线，短寿命闪烁。 */
			function updateArcs(t, pal, energy) {
				arcAcc += Math.max(0, energy - 0.75) * 2.6
				while (arcAcc >= 1 && arcs.length < 4) {
					arcAcc -= 1
					const a = Math.random() * TAU
					const b = a + (Math.random() - 0.5) * 1.4
					const r1 = 20 + Math.random() * 40
					const r2 = 20 + Math.random() * 40
					arcs.push({
						ax: CX + Math.cos(a) * r1,
						ay: CY + Math.sin(a) * r1 * 0.7,
						bx: CX + Math.cos(b) * r2,
						by: CY + Math.sin(b) * r2 * 0.7,
						life: 0,
						maxLife: 5 + Math.random() * 5,
					})
				}
				for (let i = arcs.length - 1; i >= 0; i--) {
					arcs[i].life++
					if (arcs[i].life >= arcs[i].maxLife) arcs.splice(i, 1)
				}
			}

			function drawArcs(pal) {
				if (arcs.length === 0) return
				g.save()
				g.globalCompositeOperation = 'lighter'
				for (const arc of arcs) {
					const k = Math.sin((arc.life / arc.maxLife) * Math.PI)
					g.globalAlpha = k * 0.85
					g.strokeStyle = 'rgba(' + pal.hot + ',1)'
					g.lineWidth = 0.9
					g.beginPath()
					g.moveTo(arc.ax, arc.ay)
					const segs = 5
					for (let s = 1; s <= segs; s++) {
						const kk = s / segs
						const jx = (Math.random() - 0.5) * 8
						const jy = (Math.random() - 0.5) * 8
						g.lineTo(arc.ax + (arc.bx - arc.ax) * kk + jx, arc.ay + (arc.by - arc.ay) * kk + jy)
					}
					g.stroke()
				}
				g.restore()
			}

			// ═════════════════════════════════════════════════════════
			// 共享：星尘 / 溅射 / 主循环
			// ═════════════════════════════════════════════════════════

			function drawDust(t, pal, energy) {
				g.save()
				g.globalCompositeOperation = 'lighter'
				for (const d of dust) {
					d.y -= d.vy
					if (d.y < -4) {
						d.y = H + 4
						d.x = Math.random() * W
					}
					const x = d.x + Math.sin(t * 0.9 + d.sway) * 7
					const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + d.twinkle)
					g.globalAlpha = 0.05 + 0.14 * tw * (0.4 + energy * 0.6)
					g.fillStyle = 'rgba(' + pal.line + ',1)'
					g.beginPath()
					g.arc(x, d.y, d.size * (0.8 + energy * 0.5), 0, TAU)
					g.fill()
				}
				g.restore()
			}

			function updateSparks(pal, energy) {
				sparkAcc += Math.max(0, energy - 0.9) * 2.2
				while (sparkAcc >= 1 && sparks.length < 70) {
					sparkAcc -= 1
					const a = Math.random() * TAU
					const speed = 0.4 + Math.random() * 1.4 + energy * 0.4
					sparks.push({
						x: CX + Math.cos(a) * 20,
						y: CY + Math.sin(a) * 20,
						vx: Math.cos(a) * speed,
						vy: Math.sin(a) * speed * 0.45 - 0.12,
						life: 0,
						maxLife: 20 + Math.random() * 22,
						size: 0.5 + Math.random() * 1.3,
					})
				}
				for (let i = sparks.length - 1; i >= 0; i--) {
					const s = sparks[i]
					s.life++
					s.x += s.vx
					s.y += s.vy
					s.vy += 0.012
					s.vx *= 0.985
					if (s.life >= s.maxLife || s.x < 0 || s.x > W || s.y < -20 || s.y > H + 20) sparks.splice(i, 1)
				}
			}

			function drawSparks(pal) {
				if (sparks.length === 0) return
				g.save()
				g.globalCompositeOperation = 'lighter'
				for (const s of sparks) {
					const lifeK = 1 - s.life / s.maxLife
					g.globalAlpha = lifeK * 0.85
					g.fillStyle = 'rgba(' + pal.hot + ',1)'
					g.beginPath()
					g.arc(s.x, s.y, s.size * (0.5 + lifeK * 0.8), 0, TAU)
					g.fill()
				}
				g.restore()
			}

			function frame(now) {
				if (disposed) return
				const dt = Math.min(0.05, (now - lastNow) / 1000)
				lastNow = now
				const t = (now - t0) / 1000
				state.energy += (targetEnergy() - state.energy) * Math.min(1, dt * 8)
				state.bounce *= Math.pow(0.92, dt * 60)
				const form = resolveForm()
				// 配色优先级：上下文 ≥80% 持续警报红 > 请求进行中随机跳色 > 本色(+发热)
				let pal = formPalette(form)
				if (state.contextPercent >= 80) {
					state.flashColor = null
					pal = tintPalette(pal, [255, 60, 48], 1) // 警报红
				} else if (state.streaming && !state.error) {
					if (state.flashColor === null || Date.now() >= state.nextFlashAt) {
						state.flashColor = pickFlashColor(state.flashColor)
						state.flashAt = Date.now()
						state.nextFlashAt = Date.now() + 350 + Math.random() * 650
					}
					const flashBlend = Math.min(1, (Date.now() - state.flashAt) / 220)
					pal = tintPalette(pal, state.flashColor, flashBlend)
				} else {
					state.flashColor = null
					pal = heatTintPalette(pal, state.tokenHeat)
				}
				g.clearRect(0, 0, W, H)
				drawDust(t, pal, state.energy)
				if (form === 'ultron') {
					drawUltronFilaments(t, pal, state.energy)
					drawUltronCore(t, pal, state.energy)
					drawUltronSphere(t, pal, state.energy, state.tokenHeat)
					drawUltronFragments(t, pal, state.energy)
					updateArcs(t, pal, state.energy)
					drawArcs(pal)
					drawUltronMembrane(t, pal, state.energy, state.tokenHeat)
				} else {
					drawJarvisMeridians(t, pal, state.energy, false)
					drawJarvisOrbits(t, pal, state.energy, false)
					drawJarvisCore(t, pal, state.energy, state.tokenHeat)
					drawJarvisOrbits(t, pal, state.energy, true)
					drawJarvisMeridians(t, pal, state.energy, true)
				}
				updateSparks(pal, state.energy)
				drawSparks(pal)
				raf = requestAnimationFrame(frame)
			}

			function setConversation(next) {
				state.streaming = !!next.streaming
				state.error = !!next.error
			}

			function setVoice(status) {
				state.voice = status
			}

			function setScheme(scheme) {
				state.scheme = scheme === 'light' ? 'light' : 'dark'
			}

			function setForm(form) {
				petFormSetting = form === 'ultron' || form === 'auto' ? form : 'jarvis'
			}

			function poke() {
				state.bounce = 1
				const form = resolveForm()
				for (let i = 0; i < 16; i++) {
					const a = Math.random() * TAU
					const speed = 1.2 + Math.random() * 2.2
					sparks.push({
						x: CX,
						y: CY,
						vx: Math.cos(a) * speed,
						vy: Math.sin(a) * speed * 0.5 - 0.6,
						life: 0,
						maxLife: 34 + Math.random() * 20,
						size: 0.8 + Math.random() * 1.8,
					})
				}
				if (form === 'ultron') {
					for (let i = 0; i < 3; i++) {
						const a = Math.random() * TAU
						const b = a + (Math.random() - 0.5) * 2
						arcs.push({
							ax: CX + Math.cos(a) * 18,
							ay: CY + Math.sin(a) * 18 * 0.7,
							bx: CX + Math.cos(b) * 55,
							by: CY + Math.sin(b) * 55 * 0.7,
							life: 0,
							maxLife: 7,
						})
					}
				}
				if (wakeEngine.playChime) wakeEngine.playChime('wake')
			}

			// 拖动（内存态）
			canvas.addEventListener('pointerdown', (event) => {
				state.pointer = { down: true, x: event.clientX, y: event.clientY, moved: false }
				canvas.setPointerCapture(event.pointerId)
			})
			canvas.addEventListener('pointermove', (event) => {
				if (!state.pointer.down) return
				const dx = event.clientX - state.pointer.x
				const dy = event.clientY - state.pointer.y
				if (Math.abs(dx) + Math.abs(dy) > 4) state.pointer.moved = true
				if (state.pointer.moved) {
					canvas.style.left = canvas.offsetLeft + dx + 'px'
					canvas.style.top = canvas.offsetTop + dy + 'px'
					state.pointer.x = event.clientX
					state.pointer.y = event.clientY
				}
			})
			const endPointer = () => {
				state.pointer.down = false
			}
			canvas.addEventListener('pointerup', endPointer)
			canvas.addEventListener('pointercancel', endPointer)
			canvas.addEventListener('click', (event) => {
				if (state.pointer.moved) return // 拖动不算点击
				poke()
			})

			if (reduced || typeof requestAnimationFrame !== 'function') {
				// reduced-motion / 无 rAF 环境：只画一帧静止画面
				drawDust(0.4, formPalette('jarvis'), 0.5)
				drawJarvisMeridians(0.4, formPalette('jarvis'), 0.5, false)
				drawJarvisOrbits(0.4, formPalette('jarvis'), 0.5, false)
				drawJarvisCore(0.4, formPalette('jarvis'), 0.5, 0)
				drawJarvisOrbits(0.4, formPalette('jarvis'), 0.5, true)
				drawJarvisMeridians(0.4, formPalette('jarvis'), 0.5, true)
			} else {
				raf = requestAnimationFrame(frame)
			}

			return {
				setConversation,
				setVoice,
				setScheme,
				setForm,
				setTokenHeat,
				setContextPercent,
				dispose() {
					disposed = true
					if (raf) cancelAnimationFrame(raf)
					canvas.remove()
				},
			}
		}

		// 语音唤醒系统（Web Speech API）
		//
		// 纯浏览器实现，参考同类插件的官方通道组合：
		//   - 唤醒词识别：SpeechRecognition（continuous + interimResults）
		//   - 指令写入输入框：conversation.input.right slot 的官方
		//     useInput / inputActions（setDraft），参考
		//     https://github.com/Hjay1101/dsh-plugin-voice-input
		//   - 响应音效：Web Audio 合成双音（无任何音频资源）
		// 仅 Chromium（Chrome/Edge）支持；其余浏览器显示 unsupported。
		// ───────────────────────────────────────────────────────────────

		/** 归一化供唤醒词匹配：去标点/空白/大小写。 */
		function normalizeForWake(text) {
			return String(text || '')
				.toLowerCase()
				.replace(/[\s，。！？、,.!?\-–—'"“”‘’·:：;；()[\]【】]/g, '')
		}

		/** Levenshtein 编辑距离（短字符串用，唤醒词匹配足够）。 */
		function editDistance(a, b) {
			if (a === b) return 0
			const m = a.length
			const n = b.length
			if (m === 0) return n
			if (n === 0) return m
			let prev = new Array(n + 1)
			for (let j = 0; j <= n; j++) prev[j] = j
			for (let i = 1; i <= m; i++) {
				const cur = new Array(n + 1)
				cur[0] = i
				for (let j = 1; j <= n; j++) {
					cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
				}
				prev = cur
			}
			return prev[n]
		}

		/**
		 * 模糊子串查找：在 haystack 里找第一个与 needle 编辑距离 ≤ maxDist
		 * 的窗口。窗口长度 = needle.length（容忍单字替换，如「加维斯」）或
		 * needle.length + 1（容忍识别器多塞一个音节，如「贾维斯啊」）；
		 * 不匹配截断的唤醒词（「贾维」），压误报。
		 * @returns {start, end} 或 null
		 */
		function fuzzyFind(haystack, needle, maxDist) {
			const n = needle.length
			if (n === 0) return { start: 0, end: 0 }
			for (let win = n; win <= n + maxDist; win++) {
				for (let i = 0; i + win <= haystack.length; i++) {
					if (editDistance(haystack.slice(i, i + win), needle) <= maxDist) {
						return { start: i, end: i + win }
					}
				}
			}
			return null
		}

		/**
		 * 唤醒词是否出现在识别文本中：先精确匹配（去标点/大小写），
		 * 再退到编辑距离 ≤1 的模糊匹配（容忍中文单字同音/误识）。
		 */
		function detectWake(text, wakeWord) {
			const w = normalizeForWake(wakeWord)
			if (!w) return false
			const hay = normalizeForWake(text)
			if (!hay) return false
			if (hay.includes(w)) return true
			return fuzzyFind(hay, w, 1) !== null
		}

		/** 取出唤醒词之后的指令部分（「贾维斯，帮我写总结」一句话场景；模糊命中同样剥离）。 */
		function extractAfterWake(raw, wakeWord) {
			const text = String(raw)
			const word = String(wakeWord)
			if (!word) return ''
			const lowerText = text.toLowerCase()
			const lowerWord = word.toLowerCase()
			let start = lowerText.indexOf(lowerWord)
			if (start === -1) {
				const f = fuzzyFind(lowerText, lowerWord, 1)
				start = f ? f.start : -1
			}
			if (start === -1) return ''
			return text
				.slice(start + word.length)
				.replace(/^[\s，。！？、,.!?\-–—'"“”‘’·:：;；()[\]【】]+/, '')
				.trim()
		}

		/** 含 CJK 的唤醒词用 zh-CN 识别，否则 en-US。 */
		function pickSpeechLang(wakeWord) {
			return /[\u4e00-\u9fff]/.test(String(wakeWord)) ? 'zh-CN' : 'en-US'
		}

		// ───────────────────────────────────────────────────────────────
		// 云端识别录音管线（ScriptProcessor → Float32 → 16k 重采样 →
		// 16bit PCM WAV → base64 → host /api/.../transcribe）
		// 编码部分移植自参考插件的浏览器端实现：
		// https://github.com/Hjay1101/dsh-plugin-voice-input
		// ───────────────────────────────────────────────────────────────

		function concatFloat32(chunks) {
			let total = 0
			for (const c of chunks) total += c.length
			const out = new Float32Array(total)
			let offset = 0
			for (const c of chunks) {
				out.set(c, offset)
				offset += c.length
			}
			return out
		}

		/** 线性插值重采样到 16kHz（云端 STT 标准输入）。 */
		function resample16k(samples, inputRate) {
			if (!inputRate || inputRate === 16000) return samples
			const ratio = inputRate / 16000
			const outLen = Math.max(1, Math.round(samples.length / ratio))
			const out = new Float32Array(outLen)
			for (let i = 0; i < outLen; i++) {
				const pos = i * ratio
				const i0 = Math.floor(pos)
				const i1 = Math.min(i0 + 1, samples.length - 1)
				const t = pos - i0
				out[i] = samples[i0] * (1 - t) + samples[i1] * t
			}
			return out
		}

		/** Float32 → 16bit 单声道 PCM WAV（16kHz）。 */
		function encodeWav(samples) {
			const buf = new ArrayBuffer(44 + samples.length * 2)
			const view = new DataView(buf)
			const writeStr = (offset, str) => {
				for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
			}
			writeStr(0, 'RIFF')
			view.setUint32(4, 36 + samples.length * 2, true)
			writeStr(8, 'WAVE')
			writeStr(12, 'fmt ')
			view.setUint32(16, 16, true)
			view.setUint16(20, 1, true) // PCM
			view.setUint16(22, 1, true) // mono
			view.setUint32(24, 16000, true)
			view.setUint32(28, 32000, true) // byte rate
			view.setUint16(32, 2, true) // block align
			view.setUint16(34, 16, true) // bits per sample
			writeStr(36, 'data')
			view.setUint32(40, samples.length * 2, true)
			for (let i = 0; i < samples.length; i++) {
				const s = Math.max(-1, Math.min(1, samples[i]))
				view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
			}
			return new Uint8Array(buf)
		}

		/** Uint8Array → base64（分段转码避免栈溢出）。 */
		function bytesToBase64(bytes) {
			let binary = ''
			const step = 0x8000
			for (let i = 0; i < bytes.length; i += step) {
				binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
			}
			return btoa(binary)
		}

		let voiceEnabledRef = false // 设置面板开关镜像（供 chip 显隐判断）

		// ───────────────────────────────────────────────────────────────
		// 输入打字音效（Web Audio 全合成，零资源；参考 dsh-theme-cyberpunk2077）
		// ───────────────────────────────────────────────────────────────
		let typingSfxEnabled = true // applySettings 同步设置面板开关
		let typingCtx = null
		let typingNoiseBuf = null
		let typingLastSfxAt = 0

		function ensureTypingAudio() {
			const AC =
				typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined
			if (!AC) return null
			if (!typingCtx) typingCtx = new AC()
			if (typingCtx.state === 'suspended') typingCtx.resume().catch(() => {})
			return typingCtx
		}

		function typingNoise(ctx) {
			if (typingNoiseBuf) return typingNoiseBuf
			const len = Math.floor(ctx.sampleRate * 0.06)
			const buf = ctx.createBuffer(1, len, ctx.sampleRate)
			const data = buf.getChannelData(0)
			for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
			typingNoiseBuf = buf
			return buf
		}

		/** 单键点击音：带通噪声瞬态 + 俯冲三角波（空格/回车用更低音色）。 */
		function playKeyClick(key) {
			if (!typingSfxEnabled) return
			const ctx = ensureTypingAudio()
			if (!ctx || ctx.state !== 'running') return
			const t = ctx.currentTime
			const src = ctx.createBufferSource()
			src.buffer = typingNoise(ctx)
			const bp = ctx.createBiquadFilter()
			bp.type = 'bandpass'
			bp.frequency.value = (key === ' ' ? 1300 : 1900) + Math.random() * 900
			bp.Q.value = 1.1
			const g = ctx.createGain()
			g.gain.setValueAtTime(0.0001, t)
			g.gain.exponentialRampToValueAtTime(0.08 + Math.random() * 0.04, t + 0.002)
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
			src.connect(bp)
			bp.connect(g)
			g.connect(ctx.destination)
			src.start(t)
			src.stop(t + 0.07)
			const osc = ctx.createOscillator()
			osc.type = 'triangle'
			const f0 = key === 'Enter' ? 190 : key === ' ' ? 130 : 150 + Math.random() * 40
			osc.frequency.setValueAtTime(f0, t)
			osc.frequency.exponentialRampToValueAtTime(55, t + 0.055)
			const g2 = ctx.createGain()
			g2.gain.setValueAtTime(0.0001, t)
			g2.gain.exponentialRampToValueAtTime(0.06, t + 0.003)
			g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
			osc.connect(g2)
			g2.connect(ctx.destination)
			osc.start(t)
			osc.stop(t + 0.07)
		}

		/** 回车发送提示音（90ms 节流，防连发爆音）。 */
		function playTypingSend() {
			if (!typingSfxEnabled) return
			const now = Date.now()
			if (now - typingLastSfxAt < 90) return
			typingLastSfxAt = now
			const ctx = ensureTypingAudio()
			if (!ctx || ctx.state !== 'running') return
			const t = ctx.currentTime
			const blip = (freqA, freqB, dur, vol, type, when) => {
				const start = t + (when || 0)
				const osc = ctx.createOscillator()
				osc.type = type
				osc.frequency.setValueAtTime(freqA, start)
				if (freqB !== freqA) osc.frequency.exponentialRampToValueAtTime(freqB, start + dur)
				const g = ctx.createGain()
				g.gain.setValueAtTime(0.0001, start)
				g.gain.exponentialRampToValueAtTime(vol, start + 0.008)
				g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
				osc.connect(g)
				g.connect(ctx.destination)
				osc.start(start)
				osc.stop(start + dur + 0.02)
			}
			blip(680, 1240, 0.09, 0.05, 'square') // 上扬确认音
		}

		/** 输入区打字音效：仅 TEXTAREA、忽略修饰键（回车 = 发送音，其余 = 键击音）。 */
		function onTypingKeydown(e) {
			const el = e && e.target
			if (!el || el.tagName !== 'TEXTAREA') return
			if (e.metaKey || e.ctrlKey || e.altKey) return
			if (e.key === 'Enter') {
				playTypingSend()
				return
			}
			playKeyClick(e.key)
		}

		/**
		 * 读取界面上下文使用率（%）：优先取上下文仪表触发器按钮的
		 * aria-label（"上下文已用 38%" / "38% of context used"），
		 * 兜底取面板里的纯百分比叶子文本。不调用任何接口。
		 * @returns 0..100（读不到返回 0）
		 */
		function readContextPercent() {
			if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return 0
			const buttons = document.querySelectorAll('button')
			for (const el of buttons) {
				const label = el.getAttribute && el.getAttribute('aria-label')
				if (!label || !/(上下文|context)/i.test(label)) continue
				const m = /(\d{1,3})\s*%/.exec(label)
				if (m) return Math.max(0, Math.min(100, parseInt(m[1], 10) || 0))
			}
			const all = document.querySelectorAll('*')
			for (const el of all) {
				if (el.children.length !== 0) continue
				const m = /^(\d{1,3})%$/.exec((el.textContent || '').trim())
				if (m) {
					const v = parseInt(m[1], 10)
					if (v >= 0 && v <= 100) return v
				}
			}
			return 0
		}

		/**
		 * 唤醒引擎单例：web 后端（sleep 听唤醒词 → armed 听指令 → 写入草稿
		 * → 回到 sleep；静音/报错自动重连；页面隐藏暂停）+ cloud 后端
		 * （点击录音 → host 转发云端 STT → 写入草稿）。auto 模式下 web 连续
		 * network 失败自动降级 cloud。模块 dispose 时彻底关闭。
		 */
		const wakeEngine = (() => {
			const SR =
				typeof window !== 'undefined'
					? window.SpeechRecognition || window.webkitSpeechRecognition
					: undefined
			let rec = null
			let enabled = false
			let disposed = false
			let phase = 'sleep' // sleep | armed
			let backend = 'auto' // auto | web | cloud
			let networkFails = 0 // auto 降级计数
			let wakeWord = DEFAULT_SETTINGS.wakeWord
			let lang = pickSpeechLang(wakeWord)
			let status = 'off' // off | sleeping | armed | denied | unsupported | error:* | paused | cloud-ready | recording | uploading | cloud-error
			let sessionSeq = 0 // 会话序号：旧会话的异步事件（onend 等）一律忽略
			const listeners = new Set()
			let restartTimer = null
			let silenceTimer = null
			let hardCapTimer = null
			let hudTimer = null
			let pendingText = ''
			let lastInterimText = ''
			let finalLock = false
			let manualStop = false
			// 唤醒稳定化：interim 连续两次命中才唤醒（防闪烁误报）；
			// wakeStreakAt 记录命中时间，超过 3s 的旧命中作废（防跨段残留）。
			let wakeStreak = 0
			let wakeStreakAt = 0
			let audioCtx = null
			let attachState = null // { inputActions, getDraft }
			// 云端录音状态
			let mediaStream = null
			let recorderCtx = null
			let recorderNode = null
			let recorderChunks = []
			let recordTimer = null
			let recordRate = 48000

			function publish(next) {
				status = next
				for (const fn of listeners) fn(status)
			}
			/** cloud / local 都是推挽式录音后端（不起 web 识别会话）。 */
			const isPushToTalk = () => backend === 'cloud' || backend === 'local'
			/** 推挽式后端的就绪状态名。 */
			const readyStatus = () => (backend === 'local' ? 'local-ready' : 'cloud-ready')
			function clearTimers() {
				clearTimeout(silenceTimer)
				clearTimeout(hardCapTimer)
				silenceTimer = null
				hardCapTimer = null
			}

			// ── HUD ──────────────────────────────────────────────────
			function hudShow(titleText, opts) {
				const el = document.getElementById('jarvis-wake-hud')
				if (!el || !el.querySelector) return
				const title = el.querySelector('.jh-title')
				const text = el.querySelector('.jh-text')
				if (!title || !text) return
				title.textContent = titleText
				title.classList.toggle('jarvis-pulse', !!(opts && opts.pulse))
				text.style.display = opts && opts.text ? 'block' : 'none'
				if (opts && opts.text) text.textContent = opts.text
				el.classList.add('jarvis-hud-on')
				clearTimeout(hudTimer)
				if (opts && opts.sticky) return
				hudTimer = setTimeout(hudHide, opts && opts.ms ? opts.ms : 1600)
			}
			function hudText(value) {
				const el = document.getElementById('jarvis-wake-hud')
				if (!el || !el.querySelector) return
				const text = el.querySelector('.jh-text')
				if (!text) return
				clearTimeout(hudTimer)
				text.style.display = 'block'
				text.textContent = value
				el.classList.add('jarvis-hud-on')
			}
			function hudHide() {
				const el = document.getElementById('jarvis-wake-hud')
				if (el) el.classList.remove('jarvis-hud-on')
			}

			// ── 提示音（Web Audio 合成，零资源）──────────────────────
			function chime(kind) {
				try {
					const AC = window.AudioContext || window.webkitAudioContext
					if (!AC) return
					if (!audioCtx) audioCtx = new AC()
					if (audioCtx.state === 'suspended') audioCtx.resume()
					const t0 = audioCtx.currentTime
					const notes =
						kind === 'wake' ? [659.25, 880.0] : kind === 'armed' ? [523.25] : [440.0]
					notes.forEach((freq, i) => {
						const osc = audioCtx.createOscillator()
						const gain = audioCtx.createGain()
						osc.type = 'sine'
						osc.frequency.value = freq
						const start = t0 + i * 0.12
						gain.gain.setValueAtTime(0.0001, start)
						gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
						gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
						osc.connect(gain)
						gain.connect(audioCtx.destination)
						osc.start(start)
						osc.stop(start + 0.55)
					})
				} catch {
					/* 音频策略禁用时静默 */
				}
			}

			// ── 识别会话生命周期 ────────────────────────────────────
			function beginRecognition() {
				if (!SR) {
					publish('unsupported')
					return
				}
				if (rec) {
					try {
						rec.abort()
					} catch {
						/* 已结束 */
					}
					rec = null
				}
				const seq = ++sessionSeq
				finalLock = false
				const next = new SR()
				next.lang = lang
				next.continuous = true
				next.interimResults = true
				next.maxAlternatives = 5 // 多候选：跨候选匹配显著提高唤醒召回
				next.onstart = () => {
					if (seq !== sessionSeq) return
					networkFails = 0 // 会话成功启动：重置 auto 降级计数
					publish(phase === 'armed' ? 'armed' : 'sleeping')
				}
				next.onresult = (event) => {
					if (seq !== sessionSeq) return
					onResult(event)
				}
				next.onerror = (event) => {
					if (seq !== sessionSeq) return
					onError(event)
				}
				next.onend = () => {
					if (seq !== sessionSeq) return
					onEnd()
				}
				rec = next
				try {
					next.start()
				} catch {
					/* InvalidStateError 等：交给 onend 重启循环 */
				}
			}

			function onResult(event) {
				if (finalLock) return
				// 跨候选收集：maxAlternatives=5 时每个 result 可能有多个
				// transcript，全部纳入匹配（去重、首个候选优先）。
				let interimAlts = []
				let finalAlts = []
				for (let i = event.resultIndex; i < event.results.length; i++) {
					const r = event.results[i]
					const alts = []
					// 防御：结果对象应有 length（数组式）；缺失时按 r[0] 存在与否推断
					const n =
						r && typeof r.length === 'number'
							? r.length
							: r && r[0] && typeof r[0] === 'object'
								? 1
								: 0
					for (let k = 0; k < n; k++) {
						const t = (r[k] && r[k].transcript) || ''
						if (t && alts.indexOf(t) === -1) alts.push(t)
					}
					if (r.isFinal) {
						for (const t of alts) if (finalAlts.indexOf(t) === -1) finalAlts.push(t)
					} else {
						for (const t of alts) if (interimAlts.indexOf(t) === -1) interimAlts.push(t)
					}
				}
				const interim = interimAlts.join(' ')
				const final = finalAlts.join(' ')
				if (phase === 'sleep') {
					const finalHit = finalAlts.some((t) => detectWake(t, wakeWord))
					const interimHit = interimAlts.some((t) => detectWake(t, wakeWord))
					if (finalHit) {
						// final 结果权威稳定：立即唤醒
						enterArmed()
						handleArmedResult('', final)
					} else if (interimHit && wakeStreak >= 1 && Date.now() - wakeStreakAt <= 3000) {
						// 连续两次 interim 命中（3s 内）：稳定唤醒，压闪烁误报
						enterArmed()
						handleArmedResult(interim, final)
					} else if (interimHit) {
						wakeStreak = 1
						wakeStreakAt = Date.now()
					} else {
						wakeStreak = 0
					}
				} else {
					handleArmedResult(interim, final)
				}
			}

			/** armed 阶段结果处理：缓冲为空的第一个结果里剥掉唤醒词前缀。 */
			function handleArmedResult(interim, final) {
				const clean = (text) => {
					if (!pendingText && text && detectWake(text, wakeWord)) {
						return extractAfterWake(text, wakeWord)
					}
					return text
				}
				if (interim) {
					const text = clean(interim)
					if (text) {
						lastInterimText = text
						hudText((pendingText + ' ' + text).trim())
						armSilenceTimer()
					}
				}
				if (final) {
					const text = clean(final)
					if (text) {
						pendingText = (pendingText + ' ' + text).trim()
						hudText(pendingText)
						armSilenceTimer()
					}
				}
			}

			function enterArmed() {
				phase = 'armed'
				wakeStreak = 0 // 唤醒后清零命中计数，防旧命中残留导致二次唤醒
				publish('armed')
				chime('wake')
				hudShow('AT YOUR SERVICE, SIR', { ms: 1200 })
				armHardCap()
			}

			function armSilenceTimer() {
				clearTimeout(silenceTimer)
				silenceTimer = setTimeout(() => {
					if (phase === 'armed' && !finalLock) deliverCommand()
				}, 1600)
			}

			function armHardCap() {
				clearTimeout(hardCapTimer)
				hardCapTimer = setTimeout(() => {
					if (phase === 'armed' && !finalLock) deliverCommand()
				}, 8000)
			}

			/** 经官方 inputActions 通道把文本写入草稿并聚焦输入框（web/cloud 共用）。 */
			function commitDraft(text) {
				chime('armed')
				hudShow('EXECUTING', { text, ms: 2000 })
				if (attachState && attachState.inputActions) {
					try {
						const current = attachState.getDraft ? attachState.getDraft() : ''
						attachState.inputActions.setDraft(current ? current + '\n' + text : text)
						const ta = document.querySelector("[class*='_card'] textarea, textarea")
						if (ta) ta.focus()
					} catch (err) {
						console.error('[dsh-theme-jarvis] draft write failed:', err)
					}
				}
			}

			function deliverCommand() {
				if (phase !== 'armed' || finalLock) return
				clearTimers()
				finalLock = true
				// 优先用 final 累积文本；无 final（如硬顶到期）退回最后的 interim
				const text = (pendingText || lastInterimText).trim()
				phase = 'sleep'
				if (!text) {
					backToSleep()
					return
				}
				publish('sleeping')
				commitDraft(text)
				backToSleep()
			}

			function backToSleep() {
				pendingText = ''
				lastInterimText = ''
				restartRecognition('sleep')
			}

			function restartRecognition(nextPhase) {
				phase = nextPhase === 'armed' ? 'armed' : 'sleep'
				if (rec) {
					try {
						rec.abort()
					} catch {
						/* 已结束 */
					}
					rec = null
				}
				beginRecognition()
			}

			function onError(event) {
				const err = event && event.error
				console.warn('[dsh-theme-jarvis] speech recognition error:', err)
				if (err === 'not-allowed' || err === 'service-not-allowed') {
					publish('denied')
					manualStop = true
					return
				}
				if (err === 'aborted') {
					scheduleRestart()
					return
				}
				if (err === 'no-speech') {
					// 静音属正常现象：保持当前阶段继续听
					publish(phase === 'armed' ? 'armed' : 'sleeping')
					scheduleRestart(300)
					return
				}
				if (err === 'network' && backend === 'auto') {
					// auto 模式：连续两次 network 失败 → 自动降级云端录音模式
					networkFails++
					if (networkFails >= 2) {
						backend = 'cloud'
						stopWebOnly()
						publish('cloud-ready')
						console.warn('[dsh-theme-jarvis] 浏览器语音服务不可达，已降级云端录音模式')
						return
					}
				}
				// network / audio-capture / language-not-supported 等：带错误码上报，
				// 让设置面板给出针对性指引；退避后自动重试。
				publish('error:' + (err || 'unknown'))
				scheduleRestart(err === 'network' ? 8000 : 1500)
			}

			function onEnd() {
				// 会话已结束：清掉引用，让 scheduleRestart 的重连判断
				// （if (!rec)）能够生效；过期会话的 onend 被序号守卫拦在外面。
				rec = null
				if (manualStop || disposed || !enabled || isPushToTalk()) {
					manualStop = false
					return
				}
				scheduleRestart()
			}

			function scheduleRestart(ms) {
				if (disposed || !enabled || manualStop || isPushToTalk()) return
				if (restartTimer) return
				restartTimer = setTimeout(() => {
					restartTimer = null
					if (disposed || !enabled || manualStop || isPushToTalk()) return
					if (typeof document !== 'undefined' && document.hidden) return
					if (!rec) beginRecognition()
				}, ms || 300)
			}

			/** 停止 web 识别会话但不改 enabled（auto → cloud 降级用）。 */
			function stopWebOnly() {
				clearTimers()
				clearTimeout(restartTimer)
				restartTimer = null
				if (rec) {
					try {
						rec.abort()
					} catch {
						/* 已结束 */
					}
					rec = null
				}
			}

			function onVisibility() {
				if (typeof document === 'undefined') return
				if (document.hidden) {
					if (rec) {
						manualStop = true
						try {
							rec.abort()
						} catch {
							/* 已结束 */
						}
						rec = null
					}
					if (enabled && !isPushToTalk()) publish('paused')
				} else if (enabled && !isPushToTalk()) {
					manualStop = false
					scheduleRestart(100)
				}
			}

			// ── 云端录音（push-to-talk）──────────────────────────────
			const RECORD_LIMIT_MS = 20000

			function cleanupRecorder() {
				clearTimeout(recordTimer)
				recordTimer = null
				if (recorderNode) {
					try {
						recorderNode.disconnect()
					} catch {
						/* 已断开 */
					}
					recorderNode = null
				}
				if (recorderCtx) {
					try {
						recorderCtx.close()
					} catch {
						/* 已关闭 */
					}
					recorderCtx = null
				}
				if (mediaStream) {
					mediaStream.getTracks().forEach((track) => {
						try {
							track.stop()
						} catch {
							/* 已停止 */
						}
					})
					mediaStream = null
				}
				recorderChunks = []
			}

			function startRecording() {
				if (status === 'recording') return
				if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
					publish('denied')
					return
				}
				navigator.mediaDevices
					.getUserMedia({
						audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
					})
					.then((stream) => {
						if (disposed || !enabled) {
							stream.getTracks().forEach((t) => t.stop())
							return
						}
						mediaStream = stream
						const AC = window.AudioContext || window.webkitAudioContext
						recorderCtx = new AC()
						recordRate = recorderCtx.sampleRate
						const source = recorderCtx.createMediaStreamSource(stream)
						recorderNode = recorderCtx.createScriptProcessor(4096, 1, 1)
						recorderNode.onaudioprocess = (event) => {
							recorderChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
						}
						source.connect(recorderNode)
						recorderNode.connect(recorderCtx.destination)
						recordTimer = setTimeout(stopRecording, RECORD_LIMIT_MS)
						publish('recording')
						chime('record')
					})
					.catch((err) => {
						console.warn('[dsh-theme-jarvis] getUserMedia failed:', err)
						publish('denied')
					})
			}

			async function stopRecording() {
				if (status !== 'recording') return
				clearTimeout(recordTimer)
				const chunks = recorderChunks
				const rate = recordRate
				cleanupRecorder()
				if (chunks.length === 0) {
					publish(readyStatus())
					return
				}
				publish('uploading')
				chime('record')
				try {
					const wav = encodeWav(resample16k(concatFloat32(chunks), rate))
					const resp = await fetch('/api/dsh-theme-jarvis/transcribe', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							audio: bytesToBase64(wav),
							mime: 'audio/wav',
							backend: backend === 'local' ? 'local' : 'cloud',
						}),
					})
					const data = await resp.json().catch(() => null)
					const text = data && data.ok && typeof data.text === 'string' ? data.text.trim() : ''
					if (!text) {
						console.warn('[dsh-theme-jarvis] transcribe failed:', data)
						publish(backend === 'local' ? 'local-error' : 'cloud-error')
						return
					}
					commitDraft(text)
					publish(readyStatus())
				} catch (err) {
					console.warn('[dsh-theme-jarvis] transcribe request failed:', err)
					publish(backend === 'local' ? 'local-error' : 'cloud-error')
				}
			}

			// ── 对外接口 ─────────────────────────────────────────────
			function start() {
				enabled = true
				manualStop = false
				if (isPushToTalk()) {
					publish(readyStatus())
					return
				}
				if (!SR) {
					publish('unsupported')
					return
				}
				if (rec) {
					try {
						rec.abort()
					} catch {
						/* 已结束 */
					}
					rec = null
				}
				if (typeof document !== 'undefined' && document.hidden) {
					publish('paused')
					return
				}
				beginRecognition()
			}

			function suspend() {
				enabled = false
				manualStop = true
				clearTimers()
				clearTimeout(restartTimer)
				restartTimer = null
				stopWebOnly()
				cleanupRecorder()
				publish('off')
				hudHide()
			}

			function configure(settings) {
				const word =
					settings && typeof settings.wakeWord === 'string' && settings.wakeWord.trim()
						? settings.wakeWord.trim().slice(0, 12)
						: DEFAULT_SETTINGS.wakeWord
				const want = !!(settings && settings.voice)
				const wantBackend =
					settings &&
					(settings.sttBackend === 'web' ||
						settings.sttBackend === 'cloud' ||
						settings.sttBackend === 'local')
						? settings.sttBackend
						: 'auto'
				voiceEnabledRef = want
				if (word !== wakeWord) {
					wakeWord = word
					lang = pickSpeechLang(word)
					// 唤醒词/语言变化即时生效：重启识别会话
					if (!isPushToTalk() && enabled && rec) restartRecognition(phase)
				}
				if (wantBackend !== backend) {
					// 后端切换：离开推挽后端时重置降级计数；进入推挽后端时停掉 web 会话
					if (isPushToTalk()) networkFails = 0
					backend = wantBackend
					if (isPushToTalk()) stopWebOnly()
				}
				if (!want) {
					if (enabled) suspend()
					return
				}
				if (isPushToTalk()) {
					// 已开启且后端为 cloud/local：确保 web 会话停掉，显示录音就绪。
					// 必须把 enabled 置 true —— 否则 startRecording() 的
					// `if (!enabled)` 守卫会静默丢弃音轨，录音按钮点了没反应。
					if (rec) stopWebOnly()
					enabled = true
					manualStop = false
					if (status !== 'recording' && status !== 'uploading') {
						publish(readyStatus())
					}
					return
				}
				if (!enabled) start()
				else if (!rec && !restartTimer) scheduleRestart(50)
			}

			function attach(state) {
				attachState = state
			}

			function onStateChange(fn) {
				listeners.add(fn)
				fn(status)
				return () => listeners.delete(fn)
			}

			function dispose() {
				disposed = true
				manualStop = true
				enabled = false
				clearTimers()
				clearTimeout(restartTimer)
				clearTimeout(hudTimer)
				stopWebOnly()
				cleanupRecorder()
				if (typeof document !== 'undefined') {
					document.removeEventListener('visibilitychange', onVisibility)
				}
				listeners.clear()
			}

			if (typeof document !== 'undefined') {
				document.addEventListener('visibilitychange', onVisibility)
			}

			return {
				start,
				suspend,
				configure,
				attach,
				dispose,
				onStateChange,
				startRecording,
				stopRecording,
				playChime: chime,
				getState: () => status,
				isActive: () => enabled,
				getBackend: () => backend,
			}
		})()

		// ───────────────────────────────────────────────────────────────
		// 设置面板：JARVIS 控制台（slots → settings.section）
		// ───────────────────────────────────────────────────────────────

		const ui = {
			// ── 兼容旧引用（外观行仍用 chip 系列）─────────────────────
			section: { display: 'flex', flexDirection: 'column', gap: '14px' },
			row: { display: 'flex', flexDirection: 'column', gap: '6px' },
			label: {
				fontSize: '12px',
				lineHeight: '18px',
				color: 'var(--dsw-alias-label-secondary)',
				letterSpacing: '.08em',
			},
			chips: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
			chip: {
				padding: '4px 12px',
				borderRadius: '6px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-1)',
				color: 'var(--dsw-alias-label-primary)',
				cursor: 'pointer',
				fontSize: '13px',
				lineHeight: '20px',
			},
			chipOn: {
				borderColor: 'var(--dsw-alias-brand-primary)',
				background: 'var(--dsw-alias-interactive-bg-hover-accent)',
				color: 'var(--dsw-alias-brand-text)',
				boxShadow: '0 0 8px rgba(59, 220, 244, 0.25)',
			},
			hint: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-caption)' },

			// ── 卡片分组 ─────────────────────────────────────────────
			card: {
				display: 'flex',
				flexDirection: 'column',
				gap: '12px',
				padding: '14px 16px 14px 18px',
				borderRadius: '12px',
				border: '1px solid var(--dsw-alias-border-l1)',
				background: 'var(--dsw-alias-bg-layer-1)',
				position: 'relative',
				overflow: 'hidden',
			},
			cardAccent: {
				position: 'absolute',
				left: 0,
				top: 0,
				bottom: 0,
				width: 3,
				background: 'linear-gradient(180deg, rgba(59, 220, 244, 0.85), rgba(245, 179, 60, 0.55))',
			},
			cardTitle: {
				display: 'flex',
				alignItems: 'center',
				gap: '8px',
				fontSize: '13px',
				fontWeight: 600,
				lineHeight: '20px',
				color: 'var(--dsw-alias-label-primary)',
				letterSpacing: '.06em',
			},
			cardDot: {
				width: 6,
				height: 6,
				borderRadius: '50%',
				background: 'var(--dsw-alias-brand-primary)',
				boxShadow: '0 0 6px rgba(59, 220, 244, 0.7)',
				flexShrink: 0,
			},
			cardDesc: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-caption)' },

			// ── 分段选择器 ───────────────────────────────────────────
			seg: {
				display: 'inline-flex',
				flexWrap: 'wrap',
				gap: '4px',
				padding: '3px',
				borderRadius: '9px',
				background: 'var(--dsw-alias-bg-layer-2)',
				border: '1px solid var(--dsw-alias-border-l1)',
			},
			segBtn: {
				padding: '5px 12px',
				borderRadius: '7px',
				border: 'none',
				background: 'transparent',
				color: 'var(--dsw-alias-label-secondary)',
				cursor: 'pointer',
				fontSize: '12.5px',
				lineHeight: '18px',
				fontFamily: 'inherit',
				whiteSpace: 'nowrap',
			},
			segBtnOn: {
				background: 'var(--dsw-alias-interactive-bg-hover-accent)',
				color: 'var(--dsw-alias-brand-text)',
				boxShadow: '0 0 0 1px var(--dsw-alias-border-l2), 0 0 8px rgba(59, 220, 244, 0.18)',
			},

			// ── 开关 ─────────────────────────────────────────────────
			switchTrack: (on) => ({
				width: 34,
				height: 18,
				borderRadius: 999,
				background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-3)',
				border: '1px solid ' + (on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'),
				position: 'relative',
				cursor: 'pointer',
				flexShrink: 0,
				padding: 0,
			}),
			switchKnob: (on) => ({
				position: 'absolute',
				top: 1,
				left: on ? 16 : 1,
				width: 14,
				height: 14,
				borderRadius: '50%',
				background: '#F2F8FF',
				boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
			}),

			// ── 表单控件 ─────────────────────────────────────────────
			input: {
				padding: '6px 10px',
				borderRadius: '7px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-2)',
				color: 'var(--dsw-alias-label-primary)',
				fontSize: '13px',
				lineHeight: '20px',
				fontFamily: 'inherit',
				outline: 'none',
				width: '100%',
				boxSizing: 'border-box',
			},
			primaryBtn: {
				padding: '6px 14px',
				borderRadius: '8px',
				border: 'none',
				background: 'var(--dsw-alias-brand-primary)',
				color: '#032430',
				fontSize: '13px',
				fontWeight: 600,
				lineHeight: '20px',
				cursor: 'pointer',
				boxShadow: '0 0 10px rgba(59, 220, 244, 0.35)',
			},
			ghostBtn: {
				padding: '6px 14px',
				borderRadius: '8px',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'transparent',
				color: 'var(--dsw-alias-label-primary)',
				fontSize: '13px',
				lineHeight: '20px',
				cursor: 'pointer',
			},
		}

		const MODE_OPTIONS = [
			{ value: 'dark', label: '夜航模式' },
			{ value: 'light', label: '昼光模式' },
			{ value: 'system', label: '跟随系统' },
		]

		function voiceStatusLabel(status, wakeWord) {
			if (status === 'local-ready') {
				return '本地离线识别就绪：点击输入框旁的麦克风按钮开始录音，音频只在本机处理（FunASR），绝不上传。'
			}
			if (status === 'local-error') {
				return '本地识别失败 —— 请确认本地服务已启动（在 vocotype-cli 目录运行 python 本地服务器脚本），或在下方「本地识别配置」里检查服务地址并点「检测服务」。'
			}
			if (status === 'cloud-ready') {
				return '云端识别就绪：点击输入框旁的麦克风按钮开始录音，说完再点一次（或等待自动结束），转写结果自动填入草稿。'
			}
			if (status === 'recording') {
				return '正在录音… 说完点击麦克风按钮结束（最长 20 秒自动结束）。'
			}
			if (status === 'uploading') {
				return '正在云端转写…'
			}
			if (status === 'cloud-error') {
				return '云端转写失败 —— 请检查 profile 补丁层里的 stt 配置（API Key / baseUrl / model）后重试。'
			}
			if (status === 'error:network') {
				return '无法连接语音服务 —— 浏览器语音识别走 Google/微软云端，在你的网络不可达。自动模式已准备降级云端识别，或可在下方手动选择识别后端。'
			}
			if (status === 'error:audio-capture') {
				return '麦克风被占用或不可用 —— 请检查系统麦克风，以及浏览器地址栏的权限设置。'
			}
			if (status === 'error:language-not-supported') {
				return '当前浏览器不支持该唤醒词的语言 —— 请换用中文或英文唤醒词，或更换浏览器。'
			}
			if (status && status.indexOf('error:') === 0) {
				return '语音识别服务异常（' + status.slice(6) + '），已自动重试中。'
			}
			switch (status) {
				case 'sleeping':
					return '待命中 —— 说「' + wakeWord + '」唤醒'
				case 'armed':
					return '已唤醒，正在聆听指令…'
				case 'denied':
					return '麦克风权限被拒绝 —— 点击浏览器地址栏的权限图标允许后重试'
				case 'unsupported':
					return '当前浏览器不支持语音识别（请使用 Chrome / Edge，或改用云端识别后端）'
				case 'paused':
					return '页面已隐藏，语音唤醒暂停'
				default:
					return '语音唤醒已关闭'
			}
		}

		function JarvisConsole(props) {
			// 挂载时总是从 localStorage 读最新持久化值，而不是用 apply() 时
			// 捕获的 props.settings 快照 —— 否则设置面板关闭再打开（或
			// HMR 重挂载）会显示旧值，与页面实际生效的配置不一致。
			const [s, setS] = React.useState(loadSettings)
			const [voiceState, setVoiceState] = React.useState(wakeEngine.getState())
			React.useEffect(
				() => wakeEngine.onStateChange(setVoiceState),
				[],
			)
			// 背景壁纸：本机图片库（localStorage）+ 文件选择
			const [wallpapers, setWallpapers] = React.useState(loadWallpapers)
			const [wpNote, setWpNote] = React.useState('')
			// 壁纸卡片重命名
			const [editingId, setEditingId] = React.useState(null)
			const [renameDraft, setRenameDraft] = React.useState('')
			const fileRef = React.useRef(null)
			const addWallpaperFile = (e) => {
				const file = e.target && e.target.files && e.target.files[0]
				if (e.target) e.target.value = '' // 允许重复选择同一文件
				if (!file) return
				if (file.size > WALLPAPER_MAX_BYTES) {
					setWpNote('原始图片超过 10MB，请换一张')
					return
				}
				// 参考 dsh-dream-skin：canvas 降采样 + JPEG 压缩（≤1600px，
				// 目标 ≤2MB），避免撑爆 localStorage 配额、加快渲染
				readImageAsDataUrl(file, (dataUrl) => {
					if (!dataUrl) {
						setWpNote('读取 / 压缩图片失败')
						return
					}
					if (dataUrl.length > WALLPAPER_DATA_LIMIT * 1.5) {
						setWpNote('图片压缩后仍过大')
						return
					}
					const id = 'wp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
					const name = (file.name || '壁纸').slice(0, 40)
					const next = [...wallpapers, { id, name, dataUrl }]
					if (next.reduce((sum, w) => sum + w.dataUrl.length, 0) > WALLPAPER_TOTAL_LIMIT) {
						setWpNote('壁纸库总大小超限，请先删除部分壁纸')
						return
					}
					setWallpapers(next)
					const persisted = saveWallpapers(next)
					setWpNote(
						'已添加并压缩：' + name + (persisted ? '' : '（浏览器存储已满，仅本次会话有效，刷新后需重新添加）'),
					)
					update({ wallpaper: 'user:' + id })
				})
			}
			const removeWallpaper = (id) => {
				const next = wallpapers.filter((w) => w.id !== id)
				setWallpapers(next)
				saveWallpapers(next)
				if (s.wallpaper === 'user:' + id) update({ wallpaper: 'none' })
			}
			const startRename = (wp) => {
				setEditingId(wp.id)
				setRenameDraft(wp.name)
			}
			const commitRename = () => {
				const id = editingId
				const name = renameDraft.trim().slice(0, 40)
				setEditingId(null)
				if (!id || !name) return
				const next = wallpapers.map((w) => (w.id === id ? { ...w, name } : w))
				setWallpapers(next)
				saveWallpapers(next)
				setWpNote('已重命名：' + name)
			}
			const update = (patch) => {
				const next = { ...s, ...patch }
				setS(next)
				if (props.onChange) props.onChange(next)
			}
			// ── UI 组件：分段 / 开关 / 卡片 / 滑块 / 壁纸缩略图 ──────
			const seg = (key, options, value, onChange) =>
				React.createElement(
					'div',
					{ key: key, style: ui.seg },
					options.map((opt) =>
						React.createElement(
							'button',
							{
								type: 'button',
								key: opt.value,
								onClick: () => onChange(opt.value),
								style: value === opt.value ? { ...ui.segBtn, ...ui.segBtnOn } : ui.segBtn,
							},
							opt.label,
						),
					),
				)
			const toggleRow = (key, label, desc, checked, onChange) =>
				React.createElement(
					'div',
					{
						key: key,
						style: {
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: '12px',
						},
					},
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
						React.createElement(
							'div',
							{ style: { fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } },
							label,
						),
						desc ? React.createElement('div', { style: ui.cardDesc }, desc) : null,
					),
					React.createElement(
						'button',
						{
							type: 'button',
							role: 'switch',
							'aria-checked': !!checked,
							style: ui.switchTrack(!!checked),
							onClick: () => onChange(!checked),
						},
						React.createElement('div', { style: ui.switchKnob(!!checked) }),
					),
				)
			const card = (key, title, children) =>
				React.createElement(
					'div',
					{ key: key, style: ui.card },
					React.createElement('div', { style: ui.cardAccent }),
					React.createElement(
						'div',
						{ style: ui.cardTitle },
						React.createElement('div', { style: ui.cardDot }),
						title,
					),
					children,
				)
			const slider = (labelText, value, min, max, step, format, onChange) =>
				React.createElement(
					'div',
					{ style: { display: 'flex', alignItems: 'center', gap: '10px' } },
					React.createElement(
						'div',
						{
							style: {
								fontSize: '12.5px',
								lineHeight: '18px',
								color: 'var(--dsw-alias-label-secondary)',
								width: '92px',
								flexShrink: 0,
							},
						},
						labelText,
					),
					React.createElement('input', {
						type: 'range',
						min: min,
						max: max,
						step: step,
						value: value,
						style: { flex: 1, accentColor: 'var(--dsw-alias-brand-primary)' },
						onChange: (e) => onChange(Number(e.target.value)),
					}),
					React.createElement(
						'div',
						{
							style: {
								width: '52px',
								textAlign: 'center',
								flexShrink: 0,
								fontSize: '11.5px',
								lineHeight: '18px',
								color: 'var(--dsw-alias-brand-text)',
								background: 'var(--dsw-alias-interactive-bg-hover-accent)',
								borderRadius: '5px',
								padding: '0 4px',
							},
						},
						format(value),
					),
				)
			const wpThumb = (key, opts) => {
				const {
					active,
					bg,
					label,
					onClick,
					onDelete,
					onEdit,
					editing,
					editValue,
					onEditChange,
					onEditCommit,
				} = opts
				return React.createElement(
					'div',
					{
						key: key,
						style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', width: '112px' },
					},
					React.createElement(
						'button',
						{
							type: 'button',
							title: label,
							onClick: onClick,
							style: {
								width: 104,
								height: 66,
								borderRadius: '10px',
								cursor: 'pointer',
								overflow: 'hidden',
								position: 'relative',
								flexShrink: 0,
								padding: 0,
								border:
									'2px solid ' +
									(active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'),
								boxShadow: active ? '0 0 12px rgba(59, 220, 244, 0.35)' : 'none',
								...bg,
							},
						},
						active
							? React.createElement('div', {
									style: {
										position: 'absolute',
										top: 4,
										right: 4,
										width: 12,
										height: 12,
										borderRadius: '50%',
										background: 'var(--dsw-alias-brand-primary)',
										boxShadow: '0 0 5px rgba(59, 220, 244, 0.9)',
									},
								})
							: null,
					),
					React.createElement(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: '4px', maxWidth: 112, minHeight: 18 } },
						editing
							? React.createElement('input', {
									autoFocus: true,
									value: editValue,
									maxLength: 40,
									style: {
										width: '92px',
										padding: '1px 4px',
										fontSize: '11.5px',
										lineHeight: '16px',
										border: '1px solid var(--dsw-alias-brand-primary)',
										borderRadius: '4px',
										background: 'var(--dsw-alias-bg-layer-2)',
										color: 'var(--dsw-alias-label-primary)',
										outline: 'none',
									},
									onChange: (e) => onEditChange(e.target.value),
									onBlur: onEditCommit,
									onKeyDown: (e) => {
										if (e.key === 'Enter') onEditCommit()
										if (e.key === 'Escape') onEditChange(label)
									},
								})
							: React.createElement(
									'span',
									{
										style: {
											fontSize: '11.5px',
											lineHeight: '16px',
											color: active ? 'var(--dsw-alias-brand-text)' : 'var(--dsw-alias-label-secondary)',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
											maxWidth: 80,
										},
									},
									label,
								),
						onEdit && !editing
							? React.createElement(
									'button',
									{
										type: 'button',
										title: '重命名',
										style: {
											border: 'none',
											background: 'none',
											cursor: 'pointer',
											color: 'var(--dsw-alias-label-caption)',
											fontSize: '11px',
											lineHeight: '16px',
											padding: 0,
										},
										onClick: (e) => {
											e.stopPropagation()
											onEdit()
										},
									},
									'✎',
								)
							: null,
						onDelete
							? React.createElement(
									'button',
									{
										type: 'button',
										title: '删除壁纸',
										style: {
											border: 'none',
											background: 'none',
											cursor: 'pointer',
											color: 'var(--dsw-alias-state-error-primary)',
											fontSize: '11px',
											lineHeight: '16px',
											padding: 0,
										},
										onClick: (e) => {
											e.stopPropagation()
											onDelete()
										},
									},
									'✕',
								)
							: null,
					),
				)
			}

			const inputStyle = ui.input
			const activeWp = wallpaperInfo(s)

			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: '14px' } },

				// ── 头部横幅 ────────────────────────────────────────
				React.createElement(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: '4px 4px 2px',
						},
					},
					React.createElement(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: '10px' } },
						React.createElement('div', {
							style: {
								width: 26,
								height: 26,
								borderRadius: '50%',
								flexShrink: 0,
								border: '1.5px solid var(--dsw-alias-brand-primary)',
								background:
									'radial-gradient(circle, rgba(59, 220, 244, 0.35) 0%, rgba(59, 220, 244, 0.08) 55%, transparent 72%)',
								boxShadow: '0 0 10px rgba(59, 220, 244, 0.4)',
							},
						}),
						React.createElement(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
							React.createElement(
								'div',
								{
									style: {
										fontSize: '15px',
										fontWeight: 700,
										letterSpacing: '.18em',
										color: 'var(--dsw-alias-brand-text)',
										lineHeight: '22px',
									},
								},
								'J.A.R.V.I.S.',
							),
							React.createElement(
								'div',
								{
									style: {
										fontSize: '11px',
										letterSpacing: '.22em',
										color: 'var(--dsw-alias-label-caption)',
										lineHeight: '16px',
									},
								},
								'AT YOUR SERVICE, SIR',
							),
						),
					),
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' } },
						React.createElement(
							'div',
							{
								style: {
									fontSize: '11px',
									lineHeight: '16px',
									color: 'var(--dsw-alias-label-secondary)',
									display: 'flex',
									alignItems: 'center',
									gap: '5px',
								},
							},
							React.createElement('div', {
								style: {
									width: 7,
									height: 7,
									borderRadius: '50%',
									background: 'var(--dsw-alias-state-success-primary)',
									boxShadow: '0 0 5px var(--dsw-alias-state-success-primary)',
								},
							}),
							'生效中',
						),
						React.createElement(
							'div',
							{ style: { fontSize: '11px', lineHeight: '16px', color: 'var(--dsw-alias-label-caption)' } },
							(MODE_OPTIONS.find((o) => o.value === s.mode) || {}).label || '',
						),
					),
				),

				// ── 外观 ─────────────────────────────────────────────
				card(
					'card-appearance',
					'外观',
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
						React.createElement(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
							React.createElement('div', { style: ui.label }, '显示模式'),
							seg('mode', MODE_OPTIONS, s.mode, (v) => update({ mode: v })),
						),
						React.createElement(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
							React.createElement('div', { style: ui.label }, '背景壁纸'),
							activeWp
								? React.createElement('div', {
										style: {
											height: 120,
											borderRadius: '10px',
											overflow: 'hidden',
											position: 'relative',
											border: '1px solid var(--dsw-alias-border-l1)',
											backgroundImage:
												'url("' +
												activeWp.url.replace(/"/g, '%22') +
												'"), linear-gradient(135deg, #050B14 0%, #0E2A44 60%, #1A5A72 100%)',
											backgroundSize: 'cover, cover',
											backgroundPosition: 'center',
											backgroundRepeat: 'no-repeat',
										},
									},
									React.createElement(
										'div',
										{
											style: {
												position: 'absolute',
												left: 0,
												right: 0,
												bottom: 0,
												padding: '6px 12px',
												background: 'linear-gradient(180deg, transparent, rgba(2, 8, 16, 0.78))',
												fontSize: '12px',
												lineHeight: '18px',
												color: '#D9F1FF',
												letterSpacing: '.06em',
											},
										},
										activeWp.name,
									),
								)
								: null,
							React.createElement(
								'div',
								{ style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
								wpThumb('wp-none', {
									active: s.wallpaper === 'none',
									bg: {
										background:
											'repeating-linear-gradient(45deg, var(--dsw-alias-bg-layer-2) 0 6px, var(--dsw-alias-bg-layer-3) 6px 12px)',
									},
									label: '无壁纸',
									onClick: () => update({ wallpaper: 'none' }),
								}),
								wpThumb('wp-default', {
									active: s.wallpaper === 'default',
									bg: {
										backgroundImage:
											'url("' +
											WALLPAPER_DEFAULT_URL.replace(/"/g, '%22') +
											'"), linear-gradient(135deg, #050B14 0%, #0E2A44 60%, #1A5A72 100%)',
										backgroundSize: 'cover, cover',
										backgroundPosition: 'center',
										backgroundRepeat: 'no-repeat',
									},
									label: '系统默认',
									onClick: () => update({ wallpaper: 'default' }),
								}),
								wallpapers.map((wp) =>
									wpThumb('wp-' + wp.id, {
										active: s.wallpaper === 'user:' + wp.id,
										bg: {
											backgroundImage: 'url("' + wp.dataUrl.replace(/"/g, '%22') + '")',
											backgroundSize: 'cover',
											backgroundPosition: 'center',
										},
										label: wp.name,
										onClick: () => update({ wallpaper: 'user:' + wp.id }),
										onDelete: () => removeWallpaper(wp.id),
										onEdit: () => startRename(wp),
										editing: editingId === wp.id,
										editValue: renameDraft,
										onEditChange: setRenameDraft,
										onEditCommit: commitRename,
									}),
								),
								React.createElement(
									'div',
									{
										style: {
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											gap: '5px',
											width: '112px',
										},
									},
									React.createElement(
										'button',
										{
											type: 'button',
											title: '添加壁纸',
											onClick: () => fileRef.current && fileRef.current.click(),
											style: {
												width: 104,
												height: 66,
												borderRadius: '10px',
												cursor: 'pointer',
												padding: 0,
												background: 'transparent',
												border: '2px dashed var(--dsw-alias-border-l3)',
												color: 'var(--dsw-alias-label-secondary)',
												fontSize: '22px',
												lineHeight: '60px',
											},
										},
										'＋',
									),
									React.createElement(
										'div',
										{ style: { fontSize: '11.5px', lineHeight: '16px', color: 'var(--dsw-alias-label-caption)' } },
										'添加',
									),
								),
							),
							React.createElement('input', {
								ref: fileRef,
								type: 'file',
								accept: 'image/*',
								style: { display: 'none' },
								onChange: addWallpaperFile,
							}),
							s.wallpaper !== 'none'
								? React.createElement(
										'div',
										{ style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' } },
										slider(
											'表面不透明度',
											s.wallpaperOpacity === undefined ? WALLPAPER_DEFAULT_OPACITY : s.wallpaperOpacity,
											0.2,
											1,
											0.05,
											(v) => Math.round(v * 100) + '%',
											(v) => update({ wallpaperOpacity: v }),
										),
										slider(
											'壁纸模糊',
											s.wallpaperBlur === undefined ? WALLPAPER_DEFAULT_BLUR : s.wallpaperBlur,
											0,
											60,
											1,
											(v) => v + 'px',
											(v) => update({ wallpaperBlur: v }),
										),
									)
								: null,
							React.createElement(
								'div',
								{ style: ui.hint },
								wpNote ||
									'用户壁纸经 canvas 压缩（≤1600px / JPEG ≤2MB）保存在本机浏览器；点 ✎ 可重命名。启用后界面表面半透明，滑块可调。',
							),
						),
					),
				),

				// ── 特效 ─────────────────────────────────────────────
				card(
					'card-fx',
					'特效',
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
						toggleRow('fx-scanlines', '扫描线', 'CRT 隔行扫描 + 暗角', !!s.scanlines, (v) =>
							update({ scanlines: v }),
						),
						toggleRow('fx-glow', '辉光', '主按钮脉动 + 输入框聚焦光晕', !!s.glow, (v) =>
							update({ glow: v }),
						),
						toggleRow('fx-boot', '开机动画', '进入页面时播放启动序列', !!s.boot, (v) => {
							update({ boot: v })
							if (v && props.onPlayBoot) props.onPlayBoot()
						}),
						toggleRow('fx-pet', '全息宠物', '右下角双 AI 全息粒子宠物', !!s.pet, (v) =>
							update({ pet: v }),
						),
						toggleRow('fx-typing', '打字音效', '输入框按键拟音 + 回车发送音（Web Audio 合成）', !!s.typingSfx, (v) =>
							update({ typingSfx: v }),
						),
						s.pet
							? React.createElement(
									'div',
									{
										style: {
											display: 'flex',
											flexDirection: 'column',
											gap: '6px',
											borderTop: '1px solid var(--dsw-alias-border-l1)',
											paddingTop: '10px',
										},
									},
									React.createElement('div', { style: ui.label }, '宠物形态'),
									seg(
										'petForm',
										[
											{ value: 'jarvis', label: '贾维斯 · 金色' },
											{ value: 'ultron', label: '奥创 · 蓝色' },
											{ value: 'auto', label: '自动' },
										],
										s.petForm || 'jarvis',
										(v) => update({ petForm: v }),
									),
									React.createElement(
										'div',
										{ style: ui.hint },
										'复刻《奥创纪元》双 AI 光效：贾维斯收敛环流球 / 奥创混沌电光网；auto 形态下出错自动化身奥创。',
									),
								)
							: null,
					),
				),

				// ── 语音 ─────────────────────────────────────────────
				card(
					'card-voice',
					'语音',
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
						toggleRow(
							'voice-on',
							'语音唤醒',
							'说「' + s.wakeWord + '」唤醒，继续说指令自动填入草稿',
							!!s.voice,
							(v) => update({ voice: v }),
						),
						s.voice
							? React.createElement(
									'div',
									{ style: { display: 'flex', alignItems: 'center', gap: '8px' } },
									React.createElement(
										'div',
										{
											style: {
												fontSize: '12.5px',
												lineHeight: '18px',
												color: 'var(--dsw-alias-label-secondary)',
												flexShrink: 0,
											},
										},
										'唤醒词',
									),
									React.createElement('input', {
										type: 'text',
										value: s.wakeWord,
										maxLength: 12,
										placeholder: '输入唤醒词',
										style: { ...ui.input, maxWidth: '200px' },
										onChange: (e) =>
											update({
												wakeWord: e.target.value.replace(/[，。！？、,.!?]/g, '').slice(0, 12),
											}),
									}),
								)
							: null,
						React.createElement(
							'div',
							{
								style: {
									fontSize: '12px',
									lineHeight: '18px',
									color:
										voiceState === 'armed'
											? 'var(--dsw-alias-state-success-primary)'
											: voiceState === 'denied' || (voiceState && voiceState.indexOf('error:') === 0)
												? 'var(--dsw-alias-state-error-primary)'
												: 'var(--dsw-alias-label-caption)',
									padding: '8px 10px',
									borderRadius: '8px',
									background: 'var(--dsw-alias-bg-layer-2)',
									border: '1px solid var(--dsw-alias-border-l1)',
								},
							},
							voiceStatusLabel(voiceState, s.wakeWord),
						),
						voiceState === 'denied' || (voiceState && voiceState.indexOf('error:') === 0)
							? React.createElement(
									'button',
									{ type: 'button', style: ui.ghostBtn, onClick: () => wakeEngine.start() },
									'重试',
								)
							: null,
					),
				),

				// ── 识别 ─────────────────────────────────────────────
				card(
					'card-stt',
					'识别',
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
						React.createElement(
							'div',
							{ style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
							React.createElement('div', { style: ui.label }, '识别后端'),
							seg(
								'backend',
								[
									{ value: 'auto', label: '自动' },
									{ value: 'web', label: '仅浏览器' },
									{ value: 'cloud', label: '仅云端' },
									{ value: 'local', label: '本地离线' },
								],
								s.sttBackend,
								(v) => update({ sttBackend: v }),
							),
							React.createElement(
								'div',
								{ style: ui.hint },
								'自动 = 浏览器唤醒词优先，语音服务不可达自动降级云端；本地离线 = 录音只在本机 FunASR 转写，绝不上传。',
							),
						),
						React.createElement(CloudConfigRow),
					),
				),

				// ── 底部 ─────────────────────────────────────────────
				React.createElement(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: '10px',
							padding: '2px 4px',
						},
					},
					React.createElement(
						'div',
						{ style: ui.hint },
						'所有设置即时生效，保存在本机浏览器；开机动画仅每次进入页面播放。',
					),
					React.createElement(
						'button',
						{ type: 'button', style: ui.ghostBtn, onClick: () => update({ ...DEFAULT_SETTINGS }) },
						'恢复默认',
					),
				),

				// ── 支持作者（底部收款码）──────────────────────────────
				React.createElement(
					'div',
					{
						style: {
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: '10px',
							padding: '16px 4px 4px',
						},
					},
					React.createElement(
						'div',
						{
							style: {
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
								fontSize: '13px',
								fontWeight: 600,
								lineHeight: '20px',
								color: 'var(--dsw-alias-label-primary)',
								letterSpacing: '.06em',
							},
						},
						React.createElement('div', {
							style: {
								width: 6,
								height: 6,
								borderRadius: '50%',
								background: 'var(--dsw-alias-brand-primary)',
								boxShadow: '0 0 6px rgba(59, 220, 244, 0.7)',
								flexShrink: 0,
							},
						}),
						'支持作者',
					),
					React.createElement(
						'img',
						{
							src: DONATE_QR_URL,
							alt: '微信收款码',
							style: {
								width: 176,
								height: 176,
								borderRadius: 10,
								border: '1px solid var(--dsw-alias-border-l2)',
								background: '#ffffff',
								objectFit: 'cover',
							},
						},
					),
					React.createElement(
						'div',
						{ style: { ...ui.hint, textAlign: 'center' } },
						'喜欢这个 J.A.R.V.I.S. 主题？扫一扫请作者喝杯咖啡 ☕',
					),
				),
			)
		}

		// ───────────────────────────────────────────────────────────────
		// 通用设置 → 外观行（settings.general.item，同 id 替换官方单元格）
		// 官方 slot 契约：owner 不投影 label、不传 props，行的文案与写入
		// 路径全由注册方自持。这里渲染「外观：夜航 / 昼光 / 跟随系统」，
		// 写入路径与 JARVIS 控制台共用 applySettings。
		// ───────────────────────────────────────────────────────────────

		function GeneralAppearanceRow() {
			const [mode, setMode] = React.useState((loadSettings() || currentSettings).mode)
			const pick = (nextMode) => {
				const next = { ...(loadSettings() || currentSettings), mode: nextMode }
				saveSettings(next)
				setMode(nextMode)
				if (runtimeCtx) applySettings(runtimeCtx, next)
			}
			const chip = (key, label, active, onClick) =>
				React.createElement(
					'button',
					{
						type: 'button',
						key: key,
						onClick: onClick,
						style: active ? { ...ui.chip, ...ui.chipOn } : ui.chip,
					},
					label,
				)
			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 0' } },
				React.createElement('div', { style: ui.label }, '外观'),
				React.createElement(
					'div',
					{ style: ui.chips },
					MODE_OPTIONS.map((opt) => chip(opt.value, opt.label, mode === opt.value, () => pick(opt.value))),
				),
				React.createElement('div', { style: ui.hint }, '贾维斯主题：夜航（HUD 夜视）/ 昼光（斯塔克实验室）/ 跟随系统。'),
			)
		}

		// ───────────────────────────────────────────────────────────────
		// 云端识别配置（读写 host /api/dsh-theme-jarvis/stt-config，
		// 持久化在 ~/.dsh/plugins/dsh-theme-jarvis/stt.json）
		// ───────────────────────────────────────────────────────────────

		function CloudConfigRow() {
			const [cfg, setCfg] = React.useState(null) // null = 加载中
			const [draft, setDraft] = React.useState({ apiKey: '', baseUrl: '', model: '', localUrl: '' })
			const [note, setNote] = React.useState('')
			const [localNote, setLocalNote] = React.useState('')
			const [busy, setBusy] = React.useState(false)
			const [checking, setChecking] = React.useState(false)

			React.useEffect(() => {
				let alive = true
				fetch('/api/dsh-theme-jarvis/stt-config')
					.then((r) => r.json())
					.then((data) => {
						if (!alive) return
						if (data && data.ok && data.config) {
							setCfg(data.config)
							setDraft({
								apiKey: data.config.apiKey,
								baseUrl: data.config.baseUrl,
								model: data.config.model,
								localUrl: data.config.localUrl || '',
							})
						} else {
							setCfg({ unavailable: true })
							setNote(data && data.error ? data.error : 'host 端点不可用')
						}
					})
					.catch(() => {
						if (!alive) return
						setCfg({ unavailable: true })
						setNote('无法连接 host 端点 —— 重启 dsh web 后可用')
					})
				return () => {
					alive = false
				}
			}, [])

			const save = () => {
				setBusy(true)
				fetch('/api/dsh-theme-jarvis/stt-config', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(draft),
				})
					.then((r) => r.json())
					.then((data) => {
						setBusy(false)
						if (data && data.ok && data.config) {
							setCfg(data.config)
							setNote('已保存，立即生效')
						} else {
							setNote('保存失败：' + (data && data.error ? data.error : '未知错误'))
						}
					})
					.catch(() => {
						setBusy(false)
						setNote('保存失败：网络错误')
					})
			}

			const checkLocal = () => {
				setChecking(true)
				setLocalNote('')
				fetch('/api/dsh-theme-jarvis/local-stt/health')
					.then((r) => r.json())
					.then((data) => {
						setChecking(false)
						if (data && data.ok) {
							setLocalNote(
								data.initialized
									? '本地服务已就绪（模型已加载）'
									: '本地服务在运行，但模型仍在加载中…',
							)
						} else {
							setLocalNote('本地服务未响应：' + (data && data.error ? data.error : '未知错误'))
						}
					})
					.catch(() => {
						setChecking(false)
						setLocalNote('无法连接本地服务 —— 请确认已启动本地服务器脚本')
					})
			}

			const field = (labelText, key, type, placeholder) =>
				React.createElement(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
					React.createElement(
						'div',
						{
							style: {
								fontSize: '12px',
								lineHeight: '18px',
								color: 'var(--dsw-alias-label-secondary)',
								letterSpacing: '.04em',
							},
						},
						labelText,
					),
					React.createElement('input', {
						type: type,
						value: draft[key],
						disabled: cfg === null,
						placeholder: placeholder,
						style: ui.input,
						onChange: (e) => setDraft({ ...draft, [key]: e.target.value }),
					}),
				)
			const subCard = (title, children) =>
				React.createElement(
					'div',
					{ style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
					React.createElement(
						'div',
						{ style: ui.cardTitle },
						React.createElement('div', { style: ui.cardDot }),
						title,
					),
					children,
				)

			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
				subCard(
					'云端识别',
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
						field('API Key', 'apiKey', 'password', cfg && cfg.unavailable ? '重启 dsh web 后填写' : 'sk-...'),
						field('请求地址（baseUrl）', 'baseUrl', 'text', 'https://api.siliconflow.cn/v1'),
						field('模型', 'model', 'text', 'FunAudioLLM/SenseVoiceSmall'),
						React.createElement(
							'div',
							{ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' } },
							React.createElement(
								'div',
								{ style: ui.hint },
								'API Key 只存 host 端，不进入浏览器存储。',
							),
							React.createElement(
								'button',
								{
									type: 'button',
									disabled: cfg === null || busy || (cfg && cfg.unavailable),
									style: {
										...(cfg && cfg.unavailable ? { opacity: 0.55 } : ui.primaryBtn),
										...(cfg && cfg.unavailable ? ui.ghostBtn : {}),
									},
									onClick: save,
								},
								busy ? '保存中…' : '保存配置',
							),
						),
						React.createElement(
							'div',
							{ style: ui.hint },
							note ||
								(cfg && cfg.unavailable
									? 'host 端点未就绪'
									: '保存后立即生效；兼容任意 OpenAI /audio/transcriptions 端点（默认 SiliconFlow 免费 SenseVoice）。'),
						),
					),
				),
				React.createElement('div', {
					style: { height: 1, background: 'var(--dsw-alias-border-l1)', flexShrink: 0 },
				}),
				subCard(
					'本地离线（FunASR）',
					React.createElement(
						'div',
						{ style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
						field('本地服务地址', 'localUrl', 'text', 'http://127.0.0.1:8010'),
						React.createElement(
							'div',
							{ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' } },
							React.createElement(
								'div',
								{ style: ui.hint },
								'录音只在本机转写，绝不上传。',
							),
							React.createElement(
								'button',
								{ type: 'button', style: checking ? { ...ui.ghostBtn, opacity: 0.55 } : ui.ghostBtn, onClick: checkLocal },
								checking ? '检测中…' : '检测服务',
							),
						),
						React.createElement(
							'div',
							{ style: ui.hint },
							localNote ||
								'需要先启动配套服务器脚本（复用 vocotype-cli 引擎，模型首次运行自动下载约 500MB），保存地址后点「检测服务」确认就绪。',
						),
					),
				),
			)
		}

		// ───────────────────────────────────────────────────────────────
		// 输入框工具栏状态徽章（conversation.input.right）
		// 官方 slot 契约：组件自动获得 useInput / inputActions 标准 props，
		// 引擎借此读取草稿并把识别结果写回输入框。
		// ───────────────────────────────────────────────────────────────

		function WakeChip(props) {
			const { useInput, inputActions } = props
			const draft = useInput((st) => (st ? st.draft : ''))
			const draftRef = React.useRef(draft)
			draftRef.current = draft
			const [status, setStatus] = React.useState(wakeEngine.getState())
			React.useEffect(() => {
				wakeEngine.attach({ inputActions, getDraft: () => draftRef.current })
				return wakeEngine.onStateChange(setStatus)
			}, [inputActions])
			if (!voiceEnabledRef) return null

			const active = wakeEngine.isActive()
			const pushToTalk = wakeEngine.getBackend() === 'cloud' || wakeEngine.getBackend() === 'local'
			const broken = status === 'denied' || (status && status.indexOf('error:') === 0)

			// 云端/本地后端：麦克风即录音按钮（push-to-talk）
			if (pushToTalk) {
				const recording = status === 'recording'
				const uploading = status === 'uploading'
				const tone = recording
					? { ...ui.chipOn, borderColor: 'var(--dsw-alias-state-error-primary)' }
					: uploading
						? { opacity: 0.6 }
						: broken
							? { borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' }
							: {}
				const label = recording ? '■ 停止' : uploading ? '… 转写' : broken ? '⚠ 录音' : '🎙 录音'
				return React.createElement(
					'button',
					{
						type: 'button',
						title: recording
							? '点击结束录音并转写'
							: uploading
								? '正在转写…'
								: '点击开始录音（最长 20 秒）',
						style: { ...ui.chip, ...tone, padding: '4px 10px' },
						onClick: () => (recording ? wakeEngine.stopRecording() : wakeEngine.startRecording()),
					},
					label,
				)
			}

			const armed = status === 'armed'
			const tone = armed
				? ui.chipOn
				: broken
					? { borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' }
					: active
						? {}
						: { color: 'var(--dsw-alias-label-caption)' }
			const label =
				armed ? '🎙 聆听中' : broken ? '⚠ 唤醒' : active ? '● 待命' : '○ 唤醒'

			return React.createElement(
				'button',
				{
					type: 'button',
					title:
						armed
							? '正在聆听指令'
							: active
								? '点击暂停语音唤醒'
								: '点击启动语音唤醒（可能需要授权麦克风）',
					style: { ...ui.chip, ...tone, padding: '4px 10px' },
					onClick: () => (active ? wakeEngine.suspend() : wakeEngine.start()),
				},
				label,
			)
		}

		// ───────────────────────────────────────────────────────────────
		// 工作区文件浏览器 + 多标签文件编辑器：右侧栏（details 座位）是
		// orca 风格文件树（参考 stablyai/orca 右侧栏 FileExplorer：目录按需
		// 懒加载 + 展开/收起箭头 + 深度缩进 + 文件类型图标 + 悬停/选中态 +
		// 行内加载/出错重试 + 折叠全部/刷新工具栏），双击文件打开为顶部
		// 选项卡（conversation.view，位于「对话 / 轨迹」右侧）；中间区域只
		// 显示文件内容，可编辑保存。目录/文件列表走本插件 host 路由
		// （files/list、files/read、files/write）。
		// ───────────────────────────────────────────────────────────────

		let jarvisSlotSvc = null // ctx.get('slots')：动态注册/注销文件选项卡
		let jarvisFileTabSeq = 0
		const jarvisOpenFiles = new Map() // tabId -> { file, dirty, disposeEntry }
		/** 打开文件为选项卡：已打开则激活；否则动态注册一个新的 conversation.view 条目。 */
		function openFileInTab(file) {
			if (!file || typeof file.path !== 'string') return
			for (const [tabId, rec] of jarvisOpenFiles) {
				if (rec.file.path === file.path) {
					activateFileTabById(tabId)
					return
				}
			}
			if (!jarvisSlotSvc) return
			const tabId = 'jarvis-file-' + ++jarvisFileTabSeq
			const record = { file, dirty: false, disposeEntry: () => {} }
			jarvisOpenFiles.set(tabId, record)
			notifyOpenFilesChanged()
			jarvisSlotSvc.inject('conversation.view', () => {
				record.disposeEntry = jarvisSlotSvc.register(
					{
						name: 'conversation.view',
						id: tabId,
						order: 90,
						label: () => (record.dirty ? record.file.name + ' ●' : record.file.name),
					},
					() =>
						React.createElement(JarvisFileEditor, {
							filePath: record.file.path,
							fileName: record.file.name,
							tabId,
							onDirty: (dirty) => {
								record.dirty = dirty
								notifyOpenFilesChanged()
							},
							onClose: () => closeFileTab(tabId),
						}),
				)
				return record.disposeEntry
			})
			activateFileTabById(tabId)
		}
		/** 关闭文件选项卡：注销动态视图条目并清理。 */
		function closeFileTab(tabId) {
			const record = jarvisOpenFiles.get(tabId)
			if (!record) return
			jarvisOpenFiles.delete(tabId)
			notifyOpenFilesChanged()
			try {
				record.disposeEntry()
			} catch {
				/* 已注销 */
			}
		}
		/** 激活某文件选项卡（官方 setView 需要 chatStore，这里点击对应 tab）。 */
		function activateFileTabById(tabId) {
			try {
				const record = jarvisOpenFiles.get(tabId)
				if (!record) return
				const label = record.dirty ? record.file.name + ' ●' : record.file.name
				activateViewTabByLabel(label)
			} catch {
				/* 找不到选项卡：用户手动点即可 */
			}
		}

		/** 按标签文本点击顶栏选项卡（文件 / 终端通用）。 */
		function activateViewTabByLabel(label) {
			try {
				if (typeof document === 'undefined') return
				const tabs = document.querySelectorAll("[role='tab']")
				for (const tab of tabs) {
					if ((tab.textContent || '').trim() === label) {
						tab.click()
						return
					}
				}
			} catch {
				/* 找不到选项卡：用户手动点即可 */
			}
		}

		// ── 终端 / 新文件（顶栏加号菜单）──────────────────────────────
		let jarvisTermSeq = 0
		let jarvisWorkspaceCwd = null // 当前会话工作区（JarvisDetailsPanel 同步）
		const jarvisOpenTerminals = new Map() // tabId -> { kind, cwd, sessionId, disposeEntry }
		/** 打开终端选项卡：注册动态 conversation.view 条目，中间区域渲染终端。 */
		function openTerminalTab(kind) {
			if (!jarvisSlotSvc) return
			const cwd = jarvisWorkspaceCwd
			if (!cwd) return
			const tabId = 'jarvis-term-' + ++jarvisTermSeq
			const label = kind === 'git' ? 'Git Bash' : 'PowerShell'
			const record = { kind, cwd, sessionId: null, disposeEntry: () => {} }
			jarvisOpenTerminals.set(tabId, record)
			jarvisSlotSvc.inject('conversation.view', () => {
				record.disposeEntry = jarvisSlotSvc.register(
					{
						name: 'conversation.view',
						id: tabId,
						order: 95,
						label: () => label,
					},
					() =>
						React.createElement(JarvisTerminal, {
							tabId,
							record,
							onClose: () => closeTerminalTab(tabId),
						}),
				)
				return record.disposeEntry
			})
			activateViewTabByLabel(label)
		}
		/** 关闭终端选项卡：注销动态条目并关闭 host 会话。 */
		function closeTerminalTab(tabId) {
			const record = jarvisOpenTerminals.get(tabId)
			if (!record) return
			jarvisOpenTerminals.delete(tabId)
			if (record.sessionId) {
				postJarvisApi('/api/dsh-theme-jarvis/terminal/close', { sessionId: record.sessionId }).catch(
					() => {},
				)
				record.sessionId = null
			}
			try {
				record.disposeEntry()
			} catch {
				/* 已注销 */
			}
		}
		/** 新建文件：在会话工作区创建 untitled 文件并打开为选项卡。 */
		function createNewFileTab() {
			const dir = jarvisWorkspaceCwd
			if (!dir) return
			postJarvisApi('/api/dsh-theme-jarvis/files/create', { dir, name: 'untitled.txt' })
				.then((data) => {
					if (!data || !data.path) return
					openFileInTab({ name: data.name || 'untitled.txt', path: data.path, size: 0 })
					openFileSidebar()
				})
				.catch(() => {})
		}

		let jarvisLayoutSvc = null // ctx.get('layout')：右侧栏开合
		let jarvisDetailsOpen = false // 本插件维护的右侧栏开合标志（layout 无 getter）
		const jarvisDetailsListeners = new Set()
		function notifyDetailsChanged() {
			for (const fn of jarvisDetailsListeners) {
				try {
					fn()
				} catch {
					/* 忽略单个监听器异常 */
				}
			}
		}
		function openFileSidebar() {
			try {
				if (jarvisLayoutSvc && typeof jarvisLayoutSvc.openDetails === 'function') jarvisLayoutSvc.openDetails()
				jarvisDetailsOpen = true
				notifyDetailsChanged()
			} catch {
				/* 布局服务缺失时静默 */
			}
		}
		function closeFileSidebar() {
			try {
				if (jarvisLayoutSvc && typeof jarvisLayoutSvc.closeDetails === 'function') jarvisLayoutSvc.closeDetails()
			} catch {
				/* 布局服务缺失时静默 */
			}
			jarvisDetailsOpen = false
			notifyDetailsChanged()
		}

		/** 封装 host 信封 RPC（host.listDirectory / host.openPath）。 */
		async function hostRpc(method, payload) {
			if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
				throw new Error('hostRpc unavailable')
			}
			const resp = await window.fetch('/api/' + method, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'client-request',
					rpcId:
						typeof crypto !== 'undefined' && crypto.randomUUID
							? crypto.randomUUID()
							: 'jarvis-' + Date.now(),
					method,
					payload: payload || {},
				}),
			})
			const data = await resp.json().catch(() => null)
			const r = data && data.result
			if (!r || !r.ok) {
				throw new Error((r && r.error && r.error.message) || 'host rpc failed: ' + method)
			}
			return r.value
		}

		/** 调用本插件 host 的普通 JSON 路由（files/list、files/read）。 */
		async function postJarvisApi(route, payload) {
			if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
				throw new Error('host api unavailable')
			}
			const resp = await window.fetch(route, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload || {}),
			})
			const data = await resp.json().catch(() => null)
			if (!data || !data.ok) {
				throw new Error((data && data.error) || 'host api failed: ' + route)
			}
			return data
		}

		/** 把 host 信封错误翻译成可操作提示：目录浏览依赖宿主提供 browse 能力。
		 *  宿主把目录选择器组合固定为 native（本地 Windows/SSH 等场景的默认）时，
		 *  host.listDirectory 会被拒（"needs the browse capability"）；此时给出
		 *  明确指引而不是把原始英文错误直接渲染到面板。 */
		function friendlyBrowseError(message) {
			if (typeof message === 'string' && /browse capability|composed picker/i.test(message)) {
				return (
					'宿主未提供目录浏览（browse）能力：组合的目录选择器仅服务 native（系统对话框）。' +
					'如需在右侧栏浏览工作区目录，请在宿主 web profile 把目录选择器固定为 browse 组合（替换 directory-picker-auto 行）。'
				)
			}
			return message || '无法列出目录'
		}

		// ── 文件树样式（orca 风格行：悬停 / 选中态、旋转箭头、打开 ● 标记）──
		// 用 color-mix 引用 token，明暗主题自动跟随；不产生 CSS 包含块，
		// 不影响任何弹层定位（与壁纸 backdrop-filter 教训一致）。
		const JARVIS_TREE_CSS = [
			// 行（orca FileExplorerRow：px-2 py-1 gap-1 text-xs rounded-sm，缩进 depth*16+8）
			'.jarvis-tree-row { display: flex; align-items: center; gap: 4px; width: 100%; padding: 4px 8px;',
			'  border: none; background: transparent; color: var(--dsw-alias-label-primary);',
			'  font-size: 12px; line-height: 20px; text-align: left; font-family: inherit; cursor: pointer;',
			'  border-radius: 4px; transition: background-color 120ms ease, color 120ms ease; }',
			'.jarvis-tree-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }',
			'.jarvis-tree-row.is-selected { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }',
			'.jarvis-tree-row.is-selected:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); }',
			'.jarvis-tree-row.is-selected .jarvis-tree-name { color: var(--dsw-alias-brand-text); }',
			'.jarvis-tree-chevron { flex-shrink: 0; width: 14px; display: flex; align-items: center; justify-content: center;',
			'  color: var(--dsw-alias-label-caption); transition: transform 140ms ease; user-select: none; }',
			'.jarvis-tree-row.is-open > .jarvis-tree-chevron { transform: rotate(90deg); }',
			'.jarvis-tree-glyph { flex-shrink: 0; width: 16px; display: flex; align-items: center; justify-content: center;',
			'  color: var(--dsw-alias-label-caption); }',
			'.jarvis-tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
			'.jarvis-tree-name.is-open-file { color: var(--dsw-alias-brand-primary); }',
			'.jarvis-tree-meta { flex-shrink: 0; font-size: 10px; font-weight: 600; letter-spacing: .04em;',
			'  color: var(--dsw-alias-label-caption); margin-right: 4px; }',
			'.jarvis-tree-dot { flex-shrink: 0; width: 6px; height: 6px; border-radius: 50%;',
			'  background: var(--dsw-alias-brand-primary); box-shadow: 0 0 6px rgba(59, 220, 244, 0.7); }',
			'.jarvis-tree-dot.dirty { background: #F5B33C; box-shadow: 0 0 6px rgba(245, 179, 60, 0.8); }',
			'.jarvis-tree-spinner { display: inline-block; width: 11px; height: 11px; border-radius: 50%;',
			'  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-caption) 30%, transparent);',
			'  border-top-color: var(--dsw-alias-brand-primary); animation: jarvisSpin 0.8s linear infinite; }',
			'@keyframes jarvisSpin { to { transform: rotate(360deg); } }',
			// 工具栏（orca FileExplorerToolbar：h-8 px-2 gap-2 border-b）
			'.jarvis-tree-toolbar { display: flex; align-items: center; gap: 2px; height: 32px; min-height: 32px;',
			'  padding: 0 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex-shrink: 0; }',
			'.jarvis-tree-toolbar-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;',
			'  white-space: nowrap; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary);',
			'  line-height: 32px; padding: 0 4px; }',
			'.jarvis-tree-toolbtn { border: none; background: transparent; color: var(--dsw-alias-label-secondary);',
			'  cursor: pointer; line-height: 20px; padding: 3px 5px; border-radius: 4px;',
			'  display: inline-flex; align-items: center; justify-content: center;',
			'  transition: background-color 120ms ease, color 120ms ease; }',
			'.jarvis-tree-toolbtn svg { display: block; }',
			'.jarvis-tree-toolbtn:hover:not(:disabled) {',
			'  background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);',
			'  color: var(--dsw-alias-label-primary); }',
			'.jarvis-tree-toolbtn:disabled { opacity: 0.4; cursor: default; }',
			'.jarvis-tree-toolbtn.is-on { color: var(--dsw-alias-brand-primary); }',
			// Find files 过滤条（orca FileExplorerNameFilter：h-7 rounded-sm border）
			'.jarvis-tree-filter { display: flex; align-items: center; gap: 4px; height: 28px; margin: 6px 8px 2px;',
			'  border: 1px solid var(--dsw-alias-border-l2); border-radius: 4px;',
			'  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);',
			'  padding: 0 6px; box-sizing: border-box; flex-shrink: 0;',
			'  transition: border-color 120ms ease; }',
			'.jarvis-tree-filter:focus-within { border-color: var(--dsw-alias-brand-primary); }',
			'.jarvis-tree-filter-icon { display: flex; align-items: center; color: var(--dsw-alias-label-caption); }',
			'.jarvis-tree-filter-input { flex: 1; min-width: 0; background: transparent; border: none; outline: none;',
			'  color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 20px; font-family: inherit; }',
			'.jarvis-tree-filter-input::placeholder { color: color-mix(in srgb, var(--dsw-alias-label-caption) 55%, transparent); }',
			'.jarvis-tree-filter-clear { padding: 1px 3px; }',
			'.jarvis-tree-filter-spin { display: flex; align-items: center; color: var(--dsw-alias-label-caption);',
			'  animation: jarvisSpin 0.8s linear infinite; }',
			// Git 增删行数（+N 绿 / -M 红，orca formatPRDelta 同款）
			'.jarvis-tree-diff { display: inline-flex; gap: 4px; flex-shrink: 0; font-size: 10px;',
			'  font-weight: 600; letter-spacing: .02em; margin-right: 4px; }',
			'.jarvis-tree-diff-add { color: #4ADE80; }',
			'.jarvis-tree-diff-del { color: var(--dsw-alias-state-error-primary); }',
			// Git 操作导航栏（仓库视图顶部：拉取 / 提交 / 推送）
			'.jarvis-tree-gitops { flex-shrink: 0; border-bottom: 1px solid var(--dsw-alias-border-l1);',
			'  padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; }',
			'.jarvis-tree-gitops-row { display: flex; align-items: center; gap: 4px; }',
			'.jarvis-tree-gitop-btn { border: 1px solid var(--dsw-alias-border-l2); border-radius: 4px;',
			'  padding: 2px 8px; font-size: 12px; }',
			'.jarvis-tree-gitops-title { display: inline-flex; align-items: center; gap: 4px;',
			'  font-size: 11px; font-weight: 600; letter-spacing: .08em;',
			'  color: var(--dsw-alias-label-caption); margin-right: 2px; }',
			'.jarvis-tree-gitops-input { flex: 1; min-width: 0; font-family: inherit; font-size: 12px; line-height: 20px;',
			'  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);',
			'  border: 1px solid var(--dsw-alias-border-l2); border-radius: 4px; padding: 2px 8px; outline: none; }',
			'.jarvis-tree-gitops-input:focus { border-color: var(--dsw-alias-brand-primary); }',
			'.jarvis-tree-gitops-input:disabled { opacity: 0.5; }',
			'.jarvis-tree-gitops-commit { color: var(--dsw-alias-brand-primary); font-weight: 600; }',
			'.jarvis-tree-gitops-msg { font-size: 10.5px; line-height: 15px; color: var(--dsw-alias-label-caption);',
			'  overflow-wrap: anywhere; max-height: 48px; overflow-y: auto; }',
			'.jarvis-tree-gitops-msg.is-error { color: var(--dsw-alias-state-error-primary); }',
			// 视图切换条（目录 | 仓库）
			'.jarvis-tree-views { display: flex; gap: 2px; padding: 4px 8px 0; flex-shrink: 0; }',
			'.jarvis-tree-viewbtn { border: none; background: transparent; color: var(--dsw-alias-label-caption);',
			'  cursor: pointer; font-size: 11.5px; font-weight: 500; line-height: 20px; padding: 2px 10px;',
			'  border-radius: 4px; font-family: inherit; transition: background-color 120ms ease, color 120ms ease; }',
			'.jarvis-tree-viewbtn:hover { color: var(--dsw-alias-label-primary);',
			'  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }',
			'.jarvis-tree-viewbtn.is-on { color: var(--dsw-alias-brand-primary);',
			'  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }',
			// 仓库视图汇总行
			'.jarvis-tree-repo-summary { flex-shrink: 0; font-size: 11px; line-height: 18px; letter-spacing: .02em;',
			'  color: var(--dsw-alias-label-caption); padding: 6px 10px 2px; }',
			// 顶栏加号按钮（tablist 右侧注入）
			'.jarvis-view-add { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;',
			'  margin: auto 4px auto 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 4px;',
			'  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;',
			'  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease; }',
			'.jarvis-view-add:hover { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary);',
			'  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }',
			// 新建菜单（popover）
			'.jarvis-view-popover { position: fixed; z-index: 2147483650; min-width: 170px; padding: 4px;',
			'  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;',
			'  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35); display: flex; flex-direction: column; gap: 1px; }',
			'.jarvis-view-popover-item { display: flex; align-items: center; gap: 8px; width: 100%; border: none;',
			'  background: transparent; color: var(--dsw-alias-label-primary); font-size: 12.5px; line-height: 20px;',
			'  font-family: inherit; padding: 7px 10px; border-radius: 6px; cursor: pointer; text-align: left; }',
			'.jarvis-view-popover-item:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }',
			'.jarvis-view-popover-icon { display: inline-flex; color: var(--dsw-alias-brand-primary); }',
			// 简易终端
			'.jarvis-terminal { display: flex; flex-direction: column; height: 100%; min-height: 0;',
			'  background: #04080f; color: #cfe9f5; font-family: "Cascadia Code", Consolas, "PingFang SC", "Microsoft YaHei", monospace; }',
			'.jarvis-terminal-header { display: flex; align-items: center; justify-content: space-between;',
			'  padding: 5px 10px; border-bottom: 1px solid rgba(59, 220, 244, 0.22); flex-shrink: 0;',
			'  font-size: 11px; letter-spacing: .08em; color: var(--dsw-alias-brand-primary); }',
			'.jarvis-terminal-close { border: none; background: transparent; color: var(--dsw-alias-label-caption);',
			'  cursor: pointer; display: inline-flex; padding: 2px; border-radius: 4px; }',
			'.jarvis-terminal-close:hover { color: var(--dsw-alias-state-error-primary); }',
			'.jarvis-terminal-output { flex: 1; min-height: 0; overflow-y: auto; margin: 0; padding: 10px 12px;',
			'  font-size: 12px; line-height: 19px; white-space: pre-wrap; word-break: break-word; color: #cfe9f5; }',
			'.jarvis-terminal-input-row { display: flex; align-items: center; gap: 6px; padding: 6px 10px;',
			'  border-top: 1px solid rgba(59, 220, 244, 0.16); flex-shrink: 0; }',
			'.jarvis-terminal-prompt { color: var(--dsw-alias-brand-primary); font-weight: 700; flex-shrink: 0; }',
			'.jarvis-terminal-input { flex: 1; min-width: 0; background: transparent; border: none; outline: none;',
			'  color: #e6f5fb; font-family: inherit; font-size: 12px; }',
			'.jarvis-terminal-input:disabled { opacity: 0.5; }',
		].join('\n')

		// ── 文件类型图标：lucide 线性图标（与 orca 使用的 lucide-react 同源，
		//   数据来自 lucide-static v0.577.0，ISC 许可，按需内联，无运行时依赖）──
		const ICON_SVG = {
			file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
			'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
			'file-code': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/>',
			'file-json': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
			'file-image': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><circle cx="10" cy="12" r="2"/><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/>',
			'file-music': '<path d="M11.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v10.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 20v-7l3 1.474"/><circle cx="6" cy="20" r="2"/>',
			'file-video': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z"/>',
			'file-archive': '<path d="M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 12v-1"/><path d="M8 18v-2"/><path d="M8 7V6"/><circle cx="8" cy="20" r="2"/>',
			'file-spreadsheet': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
			'file-sliders': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 12h8"/><path d="M10 11v2"/><path d="M8 17h8"/><path d="M14 16v2"/>',
			'file-terminal': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m8 16 2-2-2-2"/><path d="M12 18h4"/>',
			'file-key': '<path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M4 12v6"/><path d="M4 14h2"/><path d="M9.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v4"/><circle cx="4" cy="20" r="2"/>',
			'file-lock': '<path d="M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 17v-2a2 2 0 0 0-4 0v2"/><rect width="8" height="5" x="3" y="17" rx="1"/>',
			database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
			'file-diff': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M9 10h6"/><path d="M12 13V7"/><path d="M9 17h6"/>',
			'file-chart-column': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 18v-1"/><path d="M12 18v-6"/><path d="M16 18v-3"/>',
			'file-type': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M11 18h2"/><path d="M12 12v6"/><path d="M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5"/>',
			'file-cog': '<path d="M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8z"/><path d="M20 8v12a2 2 0 0 1-2 2h-4.182"/><path d="m3.305 19.53.923-.382"/><path d="M4 10.592V4a2 2 0 0 1 2-2h8"/><path d="m4.228 16.852-.924-.383"/><path d="m5.852 15.228-.383-.923"/><path d="m5.852 20.772-.383.924"/><path d="m8.148 15.228.383-.923"/><path d="m8.53 21.696-.382-.924"/><path d="m9.773 16.852.922-.383"/><path d="m9.773 19.148.922.383"/><circle cx="7" cy="18" r="3"/>',
			'file-braces': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
			'file-axis-3d': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m8 18 4-4"/><path d="M8 10v8h8"/>',
			folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
			'folder-open': '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
			'chevron-right': '<path d="m9 18 6-6-6-6"/>',
			'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
			'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
			'list-collapse': '<path d="M10 5h11"/><path d="M10 12h11"/><path d="M10 19h11"/><path d="m3 10 3-3-3-3"/><path d="m3 20 3-3-3-3"/>',
			'list-filter': '<path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/>',
			download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
			upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
			'git-branch': '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
			plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
			terminal: '<path d="M12 19h8"/><path d="m4 17 6-6-6-6"/>',
			'file-plus': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
			eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
			'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
			'loader-2': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
			x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		}

		/** 渲染 lucide 线性图标（stroke=currentColor，颜色随父级 CSS 继承）。 */
		function renderSvgIcon(name, size) {
			const inner = ICON_SVG[name] || ICON_SVG.file
			return React.createElement('svg', {
				width: size,
				height: size,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 2,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				'aria-hidden': true,
				dangerouslySetInnerHTML: { __html: inner },
			})
		}

		// ── 文件类型图标映射（逐项对照 orca file-type-icon-extension-table.ts；
		//   含复合扩展名 tar.gz / tar.bz2 / tar.xz 优先匹配）──
		const COMPOUND_EXTENSIONS = ['tar.bz2', 'tar.gz', 'tar.xz']
		const FILE_ICON_BY_EXT = {
			'7z': 'file-archive', aac: 'file-music', adoc: 'file-text', ai: 'file-image',
			asc: 'file-key', astro: 'file-code', avi: 'file-video', avif: 'file-image',
			bash: 'file-terminal', bat: 'file-terminal', blend: 'file-axis-3d', bmp: 'file-image',
			br: 'file-archive', bz2: 'file-archive', c: 'file-code', cc: 'file-code',
			cer: 'file-key', cfg: 'file-sliders', cjs: 'file-code', clj: 'file-code',
			cmd: 'file-terminal', conf: 'file-sliders', cpp: 'file-code', crt: 'file-key',
			cs: 'file-code', css: 'file-type', csv: 'file-spreadsheet', cts: 'file-code',
			cxx: 'file-code', dart: 'file-code', db: 'database', diff: 'file-diff',
			dmg: 'file-archive', doc: 'file-text', docx: 'file-text', duckdb: 'database',
			eot: 'file-type', eps: 'file-image', erl: 'file-code', ex: 'file-code',
			exs: 'file-code', fbx: 'file-axis-3d', fish: 'file-terminal', flac: 'file-music',
			fs: 'file-code', fsx: 'file-code', gif: 'file-image', glb: 'file-axis-3d',
			gltf: 'file-axis-3d', go: 'file-code', gpg: 'file-key', gql: 'file-braces',
			gradle: 'file-cog', graphql: 'file-braces', gz: 'file-archive', h: 'file-code',
			hcl: 'file-sliders', heic: 'file-image', hpp: 'file-code', hrl: 'file-code',
			hs: 'file-code', htm: 'file-code', html: 'file-code', ico: 'file-image',
			ini: 'file-sliders', ipynb: 'file-chart-column', iso: 'file-archive', java: 'file-code',
			jpeg: 'file-image', jpg: 'file-image', js: 'file-code', json: 'file-json',
			json5: 'file-json', jsonc: 'file-json', jsx: 'file-code', key: 'file-key',
			kt: 'file-code', kts: 'file-code', less: 'file-type', lock: 'file-lock',
			log: 'file-text', lua: 'file-code', m4a: 'file-music', m4v: 'file-video',
			md: 'file-text', mdx: 'file-text', mjs: 'file-code', mkv: 'file-video',
			mmd: 'file-chart-column', mov: 'file-video', mp3: 'file-music', mp4: 'file-video',
			mpeg: 'file-video', mpg: 'file-video', mts: 'file-code', nim: 'file-code',
			nu: 'file-terminal', obj: 'file-axis-3d', ods: 'file-spreadsheet', ogg: 'file-music',
			opus: 'file-music', otf: 'file-type', p12: 'file-lock', patch: 'file-diff',
			pdf: 'file-text', pem: 'file-key', pfx: 'file-lock', php: 'file-code',
			pl: 'file-code', pm: 'file-code', png: 'file-image', ppt: 'file-chart-column',
			pptx: 'file-chart-column', prisma: 'database', properties: 'file-sliders',
			proto: 'file-braces', ps1: 'file-terminal', psd: 'file-image', pub: 'file-key',
			py: 'file-code', r: 'file-code', rar: 'file-archive', rb: 'file-code',
			rst: 'file-text', rs: 'file-code', rtf: 'file-text', sass: 'file-type',
			scala: 'file-code', scss: 'file-type', sh: 'file-terminal', sol: 'file-code',
			sql: 'database', sqlite: 'database', sqlite3: 'database', stl: 'file-axis-3d',
			svelte: 'file-code', svg: 'file-image', swift: 'file-code', tar: 'file-archive',
			'tar.bz2': 'file-archive', 'tar.gz': 'file-archive', 'tar.xz': 'file-archive',
			tbz2: 'file-archive', tex: 'file-text', tf: 'file-sliders', tfvars: 'file-sliders',
			tgz: 'file-archive', tif: 'file-image', tiff: 'file-image', toml: 'file-sliders',
			ts: 'file-code', tsx: 'file-code', tsv: 'file-spreadsheet', ttf: 'file-type',
			txt: 'file-text', txz: 'file-archive', vb: 'file-code', vue: 'file-code',
			wav: 'file-music', webm: 'file-video', webp: 'file-image', woff: 'file-type',
			woff2: 'file-type', xhtml: 'file-code', xls: 'file-spreadsheet', xlsx: 'file-spreadsheet',
			xml: 'file-code', xz: 'file-archive', yaml: 'file-sliders', yml: 'file-sliders',
			zig: 'file-code', zip: 'file-archive', zsh: 'file-terminal',
		}
		const FILE_ICON_BY_NAME = {
			dockerfile: 'file-cog',
			makefile: 'file-terminal',
			'.env': 'file-lock',
		}
		/** 文件名 → 图标键（特殊文件名优先，其次复合/普通扩展名，兜底 file）。 */
		function getFileIconKey(name) {
			const lower = String(name || '').toLowerCase()
			if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'file-cog'
			if (lower === 'makefile' || lower.startsWith('makefile.')) return 'file-terminal'
			if (lower === '.env' || lower.startsWith('.env.')) return 'file-lock'
			const byName = FILE_ICON_BY_NAME[lower]
			if (byName) return byName
			for (const ext of COMPOUND_EXTENSIONS) {
				if (lower.endsWith('.' + ext)) return FILE_ICON_BY_EXT[ext]
			}
			const lastDot = lower.lastIndexOf('.')
			if (lastDot > 0 && lastDot < lower.length - 1) {
				const icon = FILE_ICON_BY_EXT[lower.slice(lastDot + 1)]
				if (icon) return icon
			}
			return 'file'
		}

		/** 名称排序：数字感知、大小写不敏感（目录已在列表排序时置前）。 */
		function compareFileNames(a, b) {
			return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
		}

		/** 取路径最后一段（兼容 / 与 \）。 */
		function pathBasename(p) {
			const s = String(p || '')
			const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
			return i >= 0 ? s.slice(i + 1) : s
		}

		/** 按绝对路径找已打开文件的记录（用于树中 ● 标记）。 */
		function findOpenFileRecord(path) {
			for (const rec of jarvisOpenFiles.values()) {
				if (rec.file && rec.file.path === path) return rec
			}
			return null
		}

		/** 打开文件集合变化 → 通知文件树重渲染（新标签 / 保存 / 关闭）。 */
		const jarvisOpenFilesListeners = new Set()
		function notifyOpenFilesChanged() {
			for (const fn of jarvisOpenFilesListeners) {
				try {
					fn()
				} catch {
					/* 忽略单个监听器异常 */
				}
			}
		}

		/** 拉取某目录条目（保留隐藏项，交给 showDotfiles 渲染过滤；目录在前排序）。 */
		async function fetchDir(path) {
			try {
				const data = await postJarvisApi('/api/dsh-theme-jarvis/files/list', { path })
				const list = (Array.isArray(data.entries) ? data.entries : [])
					.filter((e) => e && typeof e.name === 'string')
					.sort((a, b) =>
						a.kind === b.kind ? compareFileNames(a.name, b.name) : a.kind === 'dir' ? -1 : 1,
					)
				return { entries: list, loading: false, error: '' }
			} catch (err) {
				return { entries: [], loading: false, error: friendlyBrowseError(err && err.message) }
			}
		}

		/** 绝对路径 → 相对根目录的路径（跨平台分隔符；必须直接位于根下，
		 *  防止 /root2 之类前缀误配为 /root 的子路径）。 */
		function relativePathOf(abs, root) {
			const a = String(abs || '')
			const r = String(root || '')
			if (!r || !a.startsWith(r)) return ''
			const rest = a.slice(r.length)
			if (rest && rest[0] !== '/' && rest[0] !== '\\') return ''
			let rel = rest
			while (rel[0] === '/' || rel[0] === '\\') rel = rel.slice(1)
			return rel
		}

		/** 相对路径是否含隐藏段（任一段以 . 开头）。 */
		function isDotfileRel(rel) {
			return String(rel || '').split(/[\\/]/).some((s) => s && s[0] === '.')
		}

		/** Find files 自动拉取/搜索时跳过的噪声目录（gitignored 类）：
		 *  点开头目录（.git/.next/.cache 等）在「显示隐藏文件」打开时仍可搜；
		 *  node_modules/dist/build 等始终跳过，避免淹没 600 目录上限。 */
		const NOISE_DIRS = new Set([
			'node_modules', 'dist', 'build', 'out',
			'.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.idea',
			'__pycache__', '.venv', 'venv', 'target',
		])
		function shouldSkipSearchDir(name, showDotfiles) {
			if (!NOISE_DIRS.has(name)) return false
			if (showDotfiles && name[0] === '.') return false
			return true
		}

		// ── Git 状态展示（对齐 orca status-display.ts）──────────────────
		const GIT_LABELS = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: 'U', copied: 'C' }
		const GIT_COLORS = {
			modified: '#F5B33C', // 琥珀：未提交修改
			added: '#4ADE80', // 绿：新增
			deleted: 'var(--dsw-alias-state-error-primary)', // 红：删除
			renamed: 'var(--dsw-alias-brand-primary)', // 青：重命名
			untracked: 'var(--dsw-alias-label-caption)', // 灰：未跟踪
			copied: '#C084FC', // 紫：复制
		}
		const GIT_STATUS_PRIORITY = { deleted: 5, modified: 4, added: 3, untracked: 3, renamed: 2, copied: 1 }
		/** 取一组状态里的主导状态（orca getDominantStatus 同款优先级）。 */
		function dominantGitStatus(statuses) {
			let best = null
			let bestPriority = -1
			for (const s of statuses) {
				const p = GIT_STATUS_PRIORITY[s] ?? 0
				if (p > bestPriority) {
					best = s
					bestPriority = p
				}
			}
			return best
		}
		/** host git/status 响应 → { byPath, folders }（目录聚合，deleted 不传播，
		 *  与 orca buildFolderStatusMap 一致）。 */
		function buildGitStatusMaps(statusRecord) {
			const byPath = new Map()
			const folderBuckets = new Map()
			for (const [rel, status] of Object.entries(statusRecord || {})) {
				byPath.set(rel, status)
				if (status === 'deleted') continue
				const segs = rel.split('/')
				let cur = ''
				for (let k = 0; k < segs.length - 1; k += 1) {
					cur = cur ? cur + '/' + segs[k] : segs[k]
					const arr = folderBuckets.get(cur) || []
					arr.push(status)
					folderBuckets.set(cur, arr)
				}
			}
			const folders = new Map()
			for (const [rel, arr] of folderBuckets) folders.set(rel, dominantGitStatus(arr))
			return { byPath, folders }
		}
		/** host git/status 的 diffs 对象 → Map<rel, {additions, deletions}>。 */
		function toGitDiffMap(diffRecord) {
			const map = new Map()
			for (const [rel, v] of Object.entries(diffRecord || {})) {
				if (v && typeof v.additions === 'number' && typeof v.deletions === 'number') {
					map.set(rel, v)
				}
			}
			return map
		}
		/** 保存文件成功 → 通知树刷新 git 状态（模块级监听）。 */
		const jarvisGitRefreshListeners = new Set()
		function requestGitStatusRefresh() {
			for (const fn of jarvisGitRefreshListeners) {
				try {
					fn()
				} catch {
					/* 忽略单个监听器异常 */
				}
			}
		}

		/** 扁平化行投影（纯函数，参考 orca file-tree.ts flattenDirectoryCache）：
		 *  根 → 条目；已展开目录递归下钻；子目录加载中/出错时插入行内状态行；
		 *  showDotfiles=false 时跳过隐藏项。 */
		function flattenTreeRows(cache, expanded, root, showDotfiles) {
			if (!root) return []
			const showDot = showDotfiles !== false
			const out = []
			const visit = (path, depth) => {
				const st = cache[path]
				const entries = (st && st.entries) || []
				for (const e of entries) {
					if (!showDot && e.hidden) continue
					out.push({ kind: e.kind === 'dir' ? 'dir' : 'file', entry: e, depth })
					if (e.kind === 'dir' && expanded.has(e.path)) {
						const child = cache[e.path]
						if (child && child.loading && !(child.entries && child.entries.length)) {
							out.push({ kind: 'loading', path: e.path, depth: depth + 1 })
						} else if (child && child.error && !(child.entries && child.entries.length)) {
							out.push({ kind: 'error', path: e.path, depth: depth + 1, message: child.error })
						} else {
							visit(e.path, depth + 1)
						}
					}
				}
			}
			visit(root, 0)
			return out
		}

		/** 名称过滤投影（纯函数，参考 orca file-explorer-name-filter-projection：
		 *  命中文件按相对路径段构建合成祖先树，目录在前、名称排序，扁平输出；
		 *  过滤期间目录默认展开，collapsed 记录被收起的合成目录）。 */
		function buildNameFilterRows(cache, root, query, showDotfiles, collapsed) {
			if (!root) return []
			const tokens = String(query || '')
				.trim()
				.toLowerCase()
				.split(/\s+/)
				.filter(Boolean)
			if (tokens.length === 0) return null
			const showDot = showDotfiles !== false
			const rootChildren = new Map()
			for (const dirPath of Object.keys(cache)) {
				const st = cache[dirPath]
				if (!st || !st.entries) continue
				for (const e of st.entries) {
					if (e.kind !== 'file') continue
					const rel = relativePathOf(e.path, root)
					if (!rel) continue
					if (!showDot && (e.hidden || isDotfileRel(rel))) continue
					if (shouldSkipSearchDir(rel.split(/[\\/]/)[0], showDot)) continue
					const haystack = rel.toLowerCase()
					if (!tokens.every((t) => haystack.includes(t))) continue
					// 把命中文件的路径段织进合成树（祖先目录自动生成）
					const segs = rel.split(/[\\/]/)
					let cur = rootChildren
					let curRel = ''
					for (let i = 0; i < segs.length; i += 1) {
						const name = segs[i]
						curRel = curRel ? curRel + '/' + name : name
						const isDir = i < segs.length - 1
						let node = cur.get(name)
						if (!node) {
							node = { name, rel: curRel, isDir, depth: i, children: new Map() }
							cur.set(name, node)
						}
						if (!isDir) {
							node.path = e.path
							node.size = e.size || 0
						}
						cur = node.children
					}
				}
			}
			const out = []
			const visit = (entries) => {
				const sorted = Array.from(entries.values()).sort((a, b) =>
					a.isDir === b.isDir ? compareFileNames(a.name, b.name) : a.isDir ? -1 : 1,
				)
				for (const node of sorted) {
					out.push({
						kind: node.isDir ? 'dir' : 'file',
						synthetic: node.isDir,
						entry: {
							name: node.name,
							path: node.isDir ? 'synth:' + node.rel : node.path || '',
							kind: node.isDir ? 'dir' : 'file',
							size: node.isDir ? 0 : node.size || 0,
						},
						rel: node.rel,
						depth: node.depth,
					})
					if (node.children.size > 0 && !(collapsed && collapsed.has(node.rel))) {
						visit(node.children)
					}
				}
			}
			visit(rootChildren)
			return out
		}

		/** 文件树浏览 hook（参考 orca FileExplorer：目录按需懒加载 + 目录缓存 +
		 *  展开集合 + 扁平化行投影；带 Find files 名称过滤（全树拉取）与
		 *  显示隐藏文件开关）。 */
		function useFileTreeBrowser(initialDir) {
			const [root, setRoot] = React.useState(initialDir || null)
			const [cache, setCache] = React.useState(() => Object.create(null))
			const [expanded, setExpanded] = React.useState(() => new Set())
			const [selected, setSelected] = React.useState(null)
			const [query, setQuery] = React.useState('')
			const [filterLoading, setFilterLoading] = React.useState(false)
			const [filterCollapsed, setFilterCollapsed] = React.useState(() => new Set())
			const [showDotfiles, setShowDotfiles] = React.useState(() => {
				try {
					if (typeof window === 'undefined' || !window.localStorage) return true
					const v = window.localStorage.getItem('jarvis-tree-show-dotfiles')
					return v === null ? true : v === '1'
				} catch {
					return true
				}
			})
			const cacheRef = React.useRef(cache)
			cacheRef.current = cache
			const rootRef = React.useRef(root)
			rootRef.current = root

			const filterActive = query.trim().length > 0

			// Git 状态：根目录的 porcelain 状态表 + 目录聚合 + 增删行数 + 操作
			const [gitStatuses, setGitStatuses] = React.useState(null) // null = 未拉取
			const [gitFolders, setGitFolders] = React.useState(null)
			const [gitDiffs, setGitDiffs] = React.useState(null) // rel -> {additions, deletions}
			const [gitEnabled, setGitEnabled] = React.useState(false)
			const [gitOp, setGitOp] = React.useState({ busy: false, message: '', error: '' })
			const loadGitStatus = React.useCallback((path) => {
				if (!path) return
				postJarvisApi('/api/dsh-theme-jarvis/git/status', { path })
					.then((data) => {
						if (!data || !data.git) {
							setGitStatuses(new Map())
							setGitFolders(new Map())
							setGitDiffs(new Map())
							setGitEnabled(false)
							return
						}
						const maps = buildGitStatusMaps(data.statuses)
						setGitStatuses(maps.byPath)
						setGitFolders(maps.folders)
						setGitDiffs(toGitDiffMap(data.diffs))
						setGitEnabled(true)
					})
					.catch(() => {
						setGitStatuses(new Map())
						setGitFolders(new Map())
						setGitDiffs(new Map())
						setGitEnabled(false)
					})
			}, [])
			React.useEffect(() => {
				if (root) loadGitStatus(root)
			}, [root, loadGitStatus])
			// 保存文件成功后自动刷新 git 状态（编辑器 save → requestGitStatusRefresh）
			React.useEffect(() => {
				const handler = () => loadGitStatus(rootRef.current)
				jarvisGitRefreshListeners.add(handler)
				return () => jarvisGitRefreshListeners.delete(handler)
			}, [loadGitStatus])

			/** 确保某目录已加载（force 强制重取）。 */
			const loadDir = React.useCallback((path, force) => {
				setCache((prev) => {
					const existing = prev[path]
					if (!force && existing && (existing.loading || existing.entries)) return prev
					fetchDir(path).then((result) => {
						setCache((p) => ({ ...p, [path]: result }))
					})
					return {
						...prev,
						[path]: { entries: (existing && existing.entries) || [], loading: true, error: '' },
					}
				})
			}, [])

			/** git 操作：commit（add -A + commit）/ push / pull。成功后刷新树与状态。 */
			const runGitOp = React.useCallback(
				(op, message) => {
					if (!root || gitOp.busy) return
					setGitOp({ busy: true, message: '', error: '' })
					postJarvisApi('/api/dsh-theme-jarvis/git/op', {
						op,
						path: root,
						message: message || '',
					})
						.then((data) => {
							setGitOp({ busy: false, message: data.output || '', error: '' })
							loadDir(root, true)
							loadGitStatus(root)
						})
						.catch((err) => {
							setGitOp({
								busy: false,
								message: '',
								error: (err && err.message) || 'git 操作失败',
							})
							loadGitStatus(root)
						})
				},
				[root, gitOp.busy, loadDir, loadGitStatus],
			)

			// 根目录变化时（如切换会话）加载新根
			React.useEffect(() => {
				if (root) loadDir(root)
			}, [root, loadDir])

			// Find files：过滤激活时全树拉取（BFS；200ms 防抖；跳过噪声目录；
			// 加载占位（entries:[] + loading）按未加载处理，避免漏搜）
			React.useEffect(() => {
				if (!root || !filterActive) {
					setFilterLoading(false)
					return
				}
				let alive = true
				const timer = setTimeout(() => {
					setFilterLoading(true)
					;(async () => {
						try {
							const walkedCache = new Map() // 本次 walk 已拉取的目录，避免重复请求
							const getState = (p) => walkedCache.get(p) || cacheRef.current[p]
							const seen = new Set()
							const queue = [root]
							let fetched = 0
							while (queue.length > 0 && alive) {
								const p = queue.shift()
								if (seen.has(p)) continue
								seen.add(p)
								let st = getState(p)
								if (!st || !st.entries || (st.loading && st.entries.length === 0)) {
									if (fetched >= 600) continue // 上限：不再拉取新目录
									const result = await fetchDir(p)
									if (!alive) return
									fetched += 1
									walkedCache.set(p, result)
									setCache((prev) => ({ ...prev, [p]: result }))
									st = result
								}
								if (st && st.entries) {
									for (const e of st.entries) {
										if (e.kind !== 'dir' || seen.has(e.path)) continue
										if (shouldSkipSearchDir(e.name, showDotfiles)) continue
										queue.push(e.path)
									}
								}
							}
						} catch {
							/* 拉取中断不致命 */
						}
						if (alive) setFilterLoading(false)
					})()
				}, 200)
				return () => {
					alive = false
					clearTimeout(timer)
				}
			}, [root, filterActive, query, showDotfiles])

			/** 展开 / 收起目录（首次展开时懒加载该目录）。 */
			const toggleDir = React.useCallback(
				(path) => {
					if (!expanded.has(path)) loadDir(path)
					setExpanded((prev) => {
						const next = new Set(prev)
						if (next.has(path)) next.delete(path)
						else next.add(path)
						return next
					})
				},
				[expanded, loadDir],
			)

			/** 折叠全部目录。 */
			const collapseAll = React.useCallback(() => {
				setExpanded(new Set())
				setFilterCollapsed(new Set())
			}, [])

			/** 刷新根目录与所有已展开目录 + git 状态（工具栏旋转指示）。 */
			const refresh = React.useCallback(() => {
				if (!root) return
				const paths = new Set(expanded)
				paths.add(root)
				for (const p of paths) loadDir(p, true)
				loadGitStatus(root)
			}, [root, expanded, loadDir, loadGitStatus])

			/** 显示隐藏文件开关（orca Show Dotfiles，localStorage 持久化）。 */
			const toggleDotfiles = React.useCallback(() => {
				setShowDotfiles((prev) => {
					const next = !prev
					try {
						if (typeof window !== 'undefined' && window.localStorage) {
							window.localStorage.setItem('jarvis-tree-show-dotfiles', next ? '1' : '0')
						}
					} catch {
						/* 存储不可用时仅本次会话生效 */
					}
					return next
				})
			}, [])

			/** 过滤模式下收起 / 展开合成目录。 */
			const toggleFilterCollapse = React.useCallback((rel) => {
				setFilterCollapsed((prev) => {
					const next = new Set(prev)
					if (next.has(rel)) next.delete(rel)
					else next.add(rel)
					return next
				})
			}, [])

			/** 行投影：普通树 或 过滤合成树。 */
			const rows = React.useMemo(() => {
				if (filterActive) {
					return buildNameFilterRows(cache, root, query, showDotfiles, filterCollapsed)
				}
				return flattenTreeRows(cache, expanded, root, showDotfiles)
			}, [cache, expanded, root, filterActive, query, showDotfiles, filterCollapsed])

			const rootState = root ? cache[root] : null
			const loadingRoot =
				!!rootState && rootState.loading && !(rootState.entries && rootState.entries.length)
			const rootError =
				rootState && rootState.error && !(rootState.entries && rootState.entries.length)
					? rootState.error
					: ''
			const anyLoading = Object.keys(cache).some((p) => cache[p] && cache[p].loading)
			const filterEmpty = filterActive && !filterLoading && rows && rows.length === 0
			const filterSearching = filterActive && filterLoading && (!rows || rows.length === 0)

			return {
				root,
				cache,
				expanded,
				selected,
				setSelected,
				rows,
				anyLoading,
				toggleDir,
				collapseAll,
				refresh,
				loadDir,
				loadingRoot,
				rootError,
				query,
				setQuery,
				filterActive,
				filterLoading,
				filterCollapsed,
				toggleFilterCollapse,
				showDotfiles,
				toggleDotfiles,
				filterEmpty,
				filterSearching,
				gitStatuses,
				gitFolders,
				gitDiffs,
				gitEnabled,
				gitOp,
				runGitOp,
				isEmpty: !!root && !loadingRoot && !rootError && rows.length === 0,
			}
		}

		/** 文件：双击打开为编辑器选项卡（已打开则激活）；目录双击等同单击展开。 */
		function openFileEntry(browser, entry) {
			if (entry.kind === 'dir') {
				browser.toggleDir(entry.path)
				return
			}
			openFileInTab({ name: entry.name, path: entry.path, size: entry.size || 0 })
			openFileSidebar()
		}

		/** 字节数 → 可读大小。 */
		function formatFileSize(bytes) {
			const n = Number(bytes) || 0
			if (n < 1024) return n + ' B'
			if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
			return (n / (1024 * 1024)).toFixed(1) + ' MB'
		}

		/** 相对路径（git 用 '/' 分隔）→ 绝对路径（按根目录分隔符拼接）。 */
		function joinAbsPath(root, rel) {
			const sep = String(root || '').indexOf('\\') >= 0 ? '\\' : '/'
			return String(root || '') + sep + String(rel || '').split('/').join(sep)
		}

		/** 文件树行投影渲染（参考 orca FileExplorerRow：深度缩进 + 旋转箭头 +
		 *  文件类型图标 + 悬停 / 选中态；文件行右侧显示大小与打开 / 未保存 ●）。 */
		function renderFileTreeRows(browser) {
			if (!browser.root) {
				return React.createElement(
					'div',
					{ style: { flex: 1, minHeight: 0, ...ui.hint, textAlign: 'center', paddingTop: 14 } },
					'选择会话后浏览其工作区目录',
				)
			}
			if (browser.loadingRoot) {
				return React.createElement(
					'div',
					{
						style: {
							flex: 1,
							minHeight: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '8px',
							color: 'var(--dsw-alias-label-caption)',
							fontSize: '11.5px',
						},
					},
					React.createElement('span', { className: 'jarvis-tree-spinner' }),
					'加载中…',
				)
			}
			if (browser.rootError) {
				return React.createElement(
					'div',
					{
						style: {
							flex: 1,
							minHeight: 0,
							padding: '12px',
							fontSize: '11.5px',
							lineHeight: '17px',
							color: 'var(--dsw-alias-state-error-primary)',
							overflowWrap: 'anywhere',
						},
					},
					browser.rootError,
				)
			}
			if (browser.filterSearching) {
				return React.createElement(
					'div',
					{
						style: {
							flex: 1,
							minHeight: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '8px',
							color: 'var(--dsw-alias-label-caption)',
							fontSize: '11.5px',
						},
					},
					React.createElement('span', { className: 'jarvis-tree-spinner' }),
					'正在查找…',
				)
			}
			if (browser.filterEmpty) {
				return React.createElement(
					'div',
					{ style: { flex: 1, minHeight: 0, ...ui.hint, textAlign: 'center', paddingTop: 14 } },
					'没有匹配的文件',
				)
			}
			if (browser.isEmpty) {
				return React.createElement(
					'div',
					{ style: { flex: 1, minHeight: 0, ...ui.hint, textAlign: 'center', paddingTop: 14 } },
					'该工作区没有文件',
				)
			}
			return React.createElement(
				'div',
				{ style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 4px' } },
				browser.rows.map((row) => {
					if (row.kind === 'dir') {
						const isOpen = row.synthetic
							? !browser.filterCollapsed.has(row.rel)
							: browser.expanded.has(row.entry.path)
						// 目录聚合 git 状态（orca buildFolderStatusMap：deleted 不传播）
						const dirRel = row.synthetic
							? row.rel
							: relativePathOf(row.entry.path, browser.root).split(/[\\/]/).join('/')
						const dirGit =
							browser.gitFolders && dirRel ? browser.gitFolders.get(dirRel) : null
						return React.createElement(
							'button',
							{
								key: row.entry.path,
								type: 'button',
								className: 'jarvis-tree-row' + (isOpen ? ' is-open' : ''),
								style: { paddingLeft: 8 + row.depth * 16 },
								title: (row.synthetic ? row.rel : row.entry.path) + '\n单击展开 / 收起',
								onClick: () =>
									row.synthetic
										? browser.toggleFilterCollapse(row.rel)
										: browser.toggleDir(row.entry.path),
								onDoubleClick: () =>
									row.synthetic
										? browser.toggleFilterCollapse(row.rel)
										: browser.toggleDir(row.entry.path),
							},
							React.createElement('span', { className: 'jarvis-tree-chevron' }, renderSvgIcon('chevron-right', 12)),
							React.createElement(
								'span',
								{ className: 'jarvis-tree-glyph' },
								renderSvgIcon(isOpen ? 'folder-open' : 'folder', 14),
							),
							React.createElement('span', { className: 'jarvis-tree-name' }, row.entry.name),
							dirGit
								? React.createElement(
										'span',
										{ className: 'jarvis-tree-meta', style: { color: GIT_COLORS[dirGit] } },
										GIT_LABELS[dirGit],
									)
								: null,
						)
					}
					if (row.kind === 'file') {
						const rec = findOpenFileRecord(row.entry.path)
						// git 状态标签（orca 行右侧 STATUS_LABELS）+ 增删行数（+N -M）
						const relNorm = row.entry.path
							? relativePathOf(row.entry.path, browser.root).split(/[\\/]/).join('/')
							: ''
						const gitKey =
							browser.gitStatuses && relNorm ? browser.gitStatuses.get(relNorm) : null
						const gitDiff = browser.gitDiffs && relNorm ? browser.gitDiffs.get(relNorm) : null
						return React.createElement(
							'button',
							{
								key: row.entry.path,
								type: 'button',
								className:
									'jarvis-tree-row' + (browser.selected === row.entry.path ? ' is-selected' : ''),
								style: { paddingLeft: 8 + row.depth * 16 },
								title: row.entry.path + '\n单击选中，双击打开（可编辑保存）',
								onClick: () => browser.setSelected(row.entry.path),
								onDoubleClick: () => openFileEntry(browser, row.entry),
							},
							React.createElement(
								'span',
								{ className: 'jarvis-tree-chevron', style: { visibility: 'hidden' } },
								renderSvgIcon('chevron-right', 12),
							),
							React.createElement('span', { className: 'jarvis-tree-glyph' }, renderSvgIcon(getFileIconKey(row.entry.name), 14)),
							React.createElement(
								'span',
								{ className: 'jarvis-tree-name' + (rec ? ' is-open-file' : '') },
								row.entry.name,
							),
							gitKey
								? React.createElement(
										'span',
										{ className: 'jarvis-tree-meta', style: { color: GIT_COLORS[gitKey] } },
										GIT_LABELS[gitKey],
									)
								: null,
							gitDiff && (gitDiff.additions > 0 || gitDiff.deletions > 0)
								? React.createElement(
										'span',
										{ className: 'jarvis-tree-diff' },
										gitDiff.additions > 0
											? React.createElement('span', { className: 'jarvis-tree-diff-add' }, '+' + gitDiff.additions)
											: null,
										gitDiff.deletions > 0
											? React.createElement('span', { className: 'jarvis-tree-diff-del' }, '-' + gitDiff.deletions)
											: null,
									)
								: !gitKey
									? React.createElement('span', { className: 'jarvis-tree-meta' }, formatFileSize(row.entry.size))
									: null,
							rec
								? React.createElement('span', { className: 'jarvis-tree-dot' + (rec.dirty ? ' dirty' : '') })
								: null,
						)
					}
					if (row.kind === 'loading') {
						return React.createElement(
							'div',
							{
								key: 'loading:' + row.path,
								className: 'jarvis-tree-row',
								style: { paddingLeft: 8 + row.depth * 16, cursor: 'default' },
							},
							React.createElement(
								'span',
								{ className: 'jarvis-tree-chevron', style: { visibility: 'hidden' } },
								renderSvgIcon('chevron-right', 12),
							),
							React.createElement('span', { className: 'jarvis-tree-spinner' }),
							React.createElement('span', { className: 'jarvis-tree-name', style: { color: 'var(--dsw-alias-label-caption)' } }, '加载中…'),
						)
					}
					return React.createElement(
						'div',
						{
							key: 'error:' + row.path,
							className: 'jarvis-tree-row',
							style: { paddingLeft: 8 + row.depth * 16, cursor: 'default' },
						},
						React.createElement(
							'span',
							{ className: 'jarvis-tree-chevron', style: { visibility: 'hidden' } },
							renderSvgIcon('chevron-right', 12),
						),
						React.createElement(
							'span',
							{ className: 'jarvis-tree-glyph', style: { color: 'var(--dsw-alias-state-error-primary)' } },
							renderSvgIcon('alert-circle', 14),
						),
						React.createElement(
							'span',
							{ className: 'jarvis-tree-name', style: { color: 'var(--dsw-alias-state-error-primary)' } },
							row.message,
						),
						React.createElement(
							'button',
							{
								type: 'button',
								title: '重试',
								style: { ...ui.ghostBtn, flexShrink: 0, fontSize: '11px', padding: '1px 8px' },
								onClick: () => browser.loadDir(row.path, true),
							},
							'重试',
						),
					)
				}),
			)
		}

				/** 文件编辑器（每个打开的文件的选项卡内容）：只显示内容，可编辑保存。 */
		function JarvisFileEditor(props) {
			const { filePath, fileName, onDirty, onClose } = props
			const [status, setStatus] = React.useState('loading') // loading | ready | binary | error
			const [text, setText] = React.useState('')
			const [orig, setOrig] = React.useState('')
			const [size, setSize] = React.useState(0)
			const [saving, setSaving] = React.useState(false)
			const [note, setNote] = React.useState('')
			React.useEffect(() => {
				let alive = true
				setStatus('loading')
				postJarvisApi('/api/dsh-theme-jarvis/files/read', { path: filePath })
					.then((data) => {
						if (!alive) return
						if (data.binary) {
							setSize(data.size || 0)
							setStatus('binary')
							return
						}
						setText(data.text || '')
						setOrig(data.text || '')
						setSize(data.size || 0)
						setStatus('ready')
					})
					.catch((err) => {
						if (!alive) return
						setNote(err && err.message ? err.message : '读取失败')
						setStatus('error')
					})
				return () => {
					alive = false
				}
			}, [filePath])
			const dirty = status === 'ready' && text !== orig
			React.useEffect(() => {
				if (onDirty) onDirty(dirty)
			}, [dirty])
			const save = () => {
				if (saving || status !== 'ready') return
				setSaving(true)
				setNote('')
				postJarvisApi('/api/dsh-theme-jarvis/files/write', { path: filePath, text })
					.then(() => {
						setSaving(false)
						setOrig(text)
						setNote('已保存 ' + new Date().toLocaleTimeString())
						requestGitStatusRefresh() // 保存后刷新树中 git 状态（文件变 M）
					})
					.catch((err) => {
						setSaving(false)
						setNote('保存失败：' + (err && err.message ? err.message : '未知错误'))
					})
			}
			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
				React.createElement(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: '10px',
							padding: '10px 14px',
							borderBottom: '1px solid var(--dsw-alias-border-l1)',
							flexShrink: 0,
						},
					},
					React.createElement(
						'div',
						{ style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 } },
						dirty
							? React.createElement('div', {
									style: {
										width: 8,
										height: 8,
										borderRadius: '50%',
										background: 'var(--dsw-alias-brand-primary)',
										boxShadow: '0 0 6px rgba(59, 220, 244, 0.8)',
										flexShrink: 0,
									},
								})
							: null,
						React.createElement(
							'span',
							{
								style: {
									fontSize: '14px',
									fontWeight: 600,
									color: 'var(--dsw-alias-label-primary)',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								},
							},
							fileName,
						),
					),
					React.createElement(
						'span',
						{ style: { fontSize: '11px', color: 'var(--dsw-alias-label-caption)', flexShrink: 0 } },
						note,
					),
					React.createElement(
						'button',
						{
							type: 'button',
							disabled: saving || status !== 'ready' || !dirty,
							style: dirty ? { ...ui.primaryBtn, opacity: saving ? 0.6 : 1 } : { ...ui.ghostBtn, opacity: 0.5 },
							onClick: save,
						},
						saving ? '保存中…' : '保存',
					),
					React.createElement(
						'button',
						{ type: 'button', style: ui.ghostBtn, onClick: () => onClose && onClose() },
						'关闭',
					),
					React.createElement(
						'button',
						{
							type: 'button',
							style: ui.ghostBtn,
							title: '在系统编辑器中打开',
							onClick: () => hostRpc('host.openPath', { path: filePath }).catch(() => {}),
						},
						'外部打开',
					),
				),
				status === 'loading'
					? React.createElement('div', { style: { ...ui.hint, padding: '14px' } }, '读取中…')
					: status === 'error'
						? React.createElement(
								'div',
								{ style: { ...ui.hint, color: 'var(--dsw-alias-state-error-primary)', padding: '14px' } },
								note,
							)
						: status === 'binary'
							? React.createElement(
									'div',
									{ style: { ...ui.hint, padding: '14px' } },
									'二进制文件（' + formatFileSize(size) + '），请用「外部打开」。',
								)
							: React.createElement('textarea', {
									value: text,
									onChange: (e) => setText(e.target.value),
									spellCheck: false,
									style: {
										flex: 1,
										minHeight: 0,
										width: '100%',
										boxSizing: 'border-box',
										resize: 'none',
										border: 'none',
										outline: 'none',
										background: 'transparent',
										color: 'var(--dsw-alias-label-primary)',
										fontFamily: CODE_FONT,
										fontSize: '13px',
										lineHeight: '21px',
										padding: '14px 16px',
									},
								}),
			)
		}

		/** 简易终端（黑底输出 + 输入行；host spawn 进程 + 300ms 增量轮询）。 */
		const TERMINAL_READY_MARK = '__JARVIS_READY__'
		/** 剥离 ANSI 转义序列与 READY 握手标记，避免显示乱码控制字符。 */
		function cleanTerminalText(s) {
			return String(s || '')
				.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
				.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
				.replace(/\x1b[()][0-9A-Z]/g, '')
				.replace(/\x1b[=>]/g, '')
				.replace(/\r\n/g, '\n')
				.replace(/\r/g, '\n')
				.split(TERMINAL_READY_MARK).join('')
		}
		function JarvisTerminal(props) {
			const { tabId, record, onClose } = props
			const [text, setText] = React.useState('')
			const [input, setInput] = React.useState('')
			const [state, setState] = React.useState('opening') // opening | ready | exited | error
			const [note, setNote] = React.useState('')
			const textRef = React.useRef('')
			const outputRef = React.useRef(null)
			const actualKind = record.actualKind || record.kind
			const needsReady = actualKind !== 'git' // PowerShell 需等 chcp 生效的 READY 标记

			// 打开 host 会话
			React.useEffect(() => {
				let alive = true
				postJarvisApi('/api/dsh-theme-jarvis/terminal/open', {
					kind: record.kind,
					cwd: record.cwd,
				})
					.then((data) => {
						if (!alive) return
						record.sessionId = data.sessionId
						record.actualKind = data.kind
						if (data.kind !== 'git') {
							setState('opening') // 等 READY 标记再允许输入
						} else {
							setState('ready')
						}
					})
					.catch((err) => {
						if (!alive) return
						setState('error')
						setNote((err && err.message) || '终端启动失败')
					})
				return () => {
					alive = false
				}
			}, [record])

			// 轮询读取输出
			React.useEffect(() => {
				if (!record.sessionId) return
				let alive = true
				const poll = setInterval(() => {
					postJarvisApi('/api/dsh-theme-jarvis/terminal/read', {
						sessionId: record.sessionId,
					})
						.then((data) => {
							if (!alive) return
							if (data.output) {
								textRef.current += data.output
								setText(textRef.current)
								if (needsReady && textRef.current.includes(TERMINAL_READY_MARK)) {
									setState('ready')
								}
							}
							if (data.exited) {
								clearInterval(poll)
								setState('exited')
								setNote('终端已退出')
							}
						})
						.catch(() => {})
				}, 300)
				return () => {
					alive = false
					clearInterval(poll)
				}
			}, [record.sessionId, needsReady])

			// 输出区滚动到底
			React.useEffect(() => {
				if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
			}, [text])

			const send = () => {
				const v = input
				if (!v || state !== 'ready') return
				// 本地回显（PowerShell 非交互不回显；Git Bash 交互会自回显，可接受）
				textRef.current += v + '\n'
				setText(textRef.current)
				postJarvisApi('/api/dsh-theme-jarvis/terminal/write', {
					sessionId: record.sessionId,
					input: v + '\n',
				}).catch(() => {})
				setInput('')
			}

			const display = cleanTerminalText(state === 'opening' ? (needsReady ? '正在启动终端…' : '正在启动终端…') : text)

			return React.createElement(
				'div',
				{ className: 'jarvis-terminal' },
				React.createElement(
					'div',
					{ className: 'jarvis-terminal-header' },
					React.createElement(
						'span',
						null,
						(actualKind === 'git' ? 'Git Bash' : 'PowerShell') + (state === 'exited' ? ' — 已退出' : ''),
					),
					React.createElement(
						'button',
						{ type: 'button', className: 'jarvis-terminal-close', title: '关闭终端', onClick: onClose },
						renderSvgIcon('x', 13),
					),
				),
				React.createElement(
					'pre',
					{ ref: outputRef, className: 'jarvis-terminal-output' },
					state === 'error' ? note : display || (state === 'exited' ? note : ''),
				),
				React.createElement(
					'div',
					{ className: 'jarvis-terminal-input-row' },
					React.createElement('span', { className: 'jarvis-terminal-prompt' }, '❯'),
					React.createElement('input', {
						type: 'text',
						className: 'jarvis-terminal-input',
						value: input,
						spellCheck: false,
						autoFocus: true,
						disabled: state !== 'ready',
						placeholder: state === 'ready' ? '输入命令，回车执行…' : '',
						onChange: (e) => setInput(e.target.value),
						onKeyDown: (e) => {
							if (e.key === 'Enter') send()
						},
					}),
				),
			)
		}

		// ── 顶栏加号按钮 + 新建菜单（DOM 注入 tablist 右侧）────────────
		let viewAddButton = null
		let viewPopover = null
		let viewAddObserver = null
		let viewOutsideHandler = null
		function closeViewPopover() {
			if (viewPopover) {
				viewPopover.remove()
				viewPopover = null
			}
		}
		function openViewPopover() {
			if (!viewAddButton || typeof document === 'undefined') return
			closeViewPopover()
			const pop = document.createElement('div')
			pop.className = 'jarvis-view-popover'
			const items = [
				{ label: '终端 PowerShell', icon: 'terminal', run: () => openTerminalTab('powershell') },
				{ label: '新文件', icon: 'file-plus', run: createNewFileTab },
				{ label: 'Git 终端', icon: 'git-branch', run: () => openTerminalTab('git') },
			]
			for (const it of items) {
				const btn = document.createElement('button')
				btn.type = 'button'
				btn.className = 'jarvis-view-popover-item'
				const icon = document.createElement('span')
				icon.className = 'jarvis-view-popover-icon'
				icon.innerHTML =
					'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
					(ICON_SVG[it.icon] || '') +
					'</svg>'
				btn.appendChild(icon)
				btn.appendChild(document.createTextNode(it.label))
				btn.addEventListener('click', () => {
					closeViewPopover()
					it.run()
				})
				pop.appendChild(btn)
			}
			document.body.appendChild(pop)
			const rect = viewAddButton.getBoundingClientRect()
			pop.style.left = Math.max(8, rect.right - pop.offsetWidth) + 'px'
			pop.style.top = rect.bottom + 6 + 'px'
			viewPopover = pop
		}
		function ensureViewAddButton() {
			if (typeof document === 'undefined') return
			const tablist = document.querySelector('[role="tablist"]')
			if (!tablist || tablist.querySelector('.jarvis-view-add')) return
			const btn = document.createElement('button')
			btn.type = 'button'
			btn.className = 'jarvis-view-add'
			btn.title = '新建：终端 / 文件'
			btn.innerHTML =
				'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
				(ICON_SVG.plus || '') +
				'</svg>'
			btn.addEventListener('click', (e) => {
				e.stopPropagation()
				if (viewPopover) closeViewPopover()
				else openViewPopover()
			})
			tablist.appendChild(btn)
			viewAddButton = btn
		}
		function startViewAddWatcher() {
			if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
			ensureViewAddButton()
			viewAddObserver = new MutationObserver(() => ensureViewAddButton())
			viewAddObserver.observe(document.body, { childList: true, subtree: true })
			viewOutsideHandler = (e) => {
				if (
					viewPopover &&
					!viewPopover.contains(e.target) &&
					viewAddButton &&
					e.target !== viewAddButton &&
					!viewAddButton.contains(e.target)
				) {
					closeViewPopover()
				}
			}
			document.addEventListener('mousedown', viewOutsideHandler)
		}
		function stopViewAddWatcher() {
			if (viewAddObserver) {
				viewAddObserver.disconnect()
				viewAddObserver = null
			}
			if (viewOutsideHandler && typeof document !== 'undefined') {
				document.removeEventListener('mousedown', viewOutsideHandler)
				viewOutsideHandler = null
			}
			closeViewPopover()
			if (viewAddButton) {
				viewAddButton.remove()
				viewAddButton = null
			}
		}

		// ── 非对话视图隐藏官方输入框 ─────────────────────────────────
		// 顶栏激活的 tab 不是「对话」时（文件 / 终端标签），中间的聊天
		// 输入框（[data-composer-seat]）隐藏，让文件/终端占满可用高度。
		let composerObserver = null
		function syncComposerVisibility() {
			if (typeof document === 'undefined') return
			const seat = document.querySelector('[data-composer-seat]')
			if (!seat) return
			const active = document.querySelector('[role="tab"][aria-selected="true"]')
			const label = active ? (active.textContent || '').trim() : ''
			const isChat = label === '对话' || label === 'chat'
			seat.style.display = isChat ? '' : 'none'
		}
		function startComposerWatcher() {
			if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
			syncComposerVisibility()
			composerObserver = new MutationObserver(() => syncComposerVisibility())
			composerObserver.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['aria-selected'],
			})
		}
		function stopComposerWatcher() {
			if (composerObserver) {
				composerObserver.disconnect()
				composerObserver = null
			}
			if (typeof document !== 'undefined') {
				const seat = document.querySelector('[data-composer-seat]')
				if (seat) seat.style.display = ''
			}
		}

		/** 会话头部工具区按钮：开关右侧栏文件目录（orca 无此座，为 DSH 增设）。 */
		function JarvisFilesToggle() {
			const [, bumpDetails] = React.useReducer((x) => x + 1, 0)
			React.useEffect(() => {
				jarvisDetailsListeners.add(bumpDetails)
				return () => jarvisDetailsListeners.delete(bumpDetails)
			}, [])
			return React.createElement(
				'button',
				{
					type: 'button',
					title: jarvisDetailsOpen ? '关闭文件侧边栏' : '打开文件侧边栏',
					style: {
						border: 'none',
						background: 'transparent',
						color: jarvisDetailsOpen
							? 'var(--dsw-alias-brand-primary)'
							: 'var(--dsw-alias-label-secondary)',
						cursor: 'pointer',
						fontSize: '13px',
						lineHeight: '20px',
						padding: '2px 6px',
						borderRadius: '6px',
						display: 'inline-flex',
						alignItems: 'center',
						gap: '4px',
					},
					onClick: () => (jarvisDetailsOpen ? closeFileSidebar() : openFileSidebar()),
				},
				renderSvgIcon('folder', 14),
				' 文件',
			)
		}

		/** 仓库视图：git 变更文件列表（状态标签 + 增删行数，双击打开）+ 汇总 + 操作区。 */
		function renderGitRepoPanel(browser, commitMsg, setCommitMsg) {
			if (!browser.root) {
				return React.createElement(
					'div',
					{ style: { flex: 1, minHeight: 0, ...ui.hint, textAlign: 'center', paddingTop: 14 } },
					'选择会话后浏览其工作区目录',
				)
			}
			if (!browser.gitEnabled) {
				return React.createElement(
					'div',
					{ style: { flex: 1, minHeight: 0, ...ui.hint, textAlign: 'center', paddingTop: 14 } },
					'当前目录不是 Git 仓库',
				)
			}
			const entries = browser.gitStatuses ? Array.from(browser.gitStatuses.entries()) : []
			let additions = 0
			let deletions = 0
			if (browser.gitDiffs) {
				for (const v of browser.gitDiffs.values()) {
					additions += v.additions || 0
					deletions += v.deletions || 0
				}
			}
			return React.createElement(
				'div',
				{ style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
				// 顶部：Git 操作导航栏（拉取 / 提交 / 推送）
				renderGitOpsBar(browser, commitMsg, setCommitMsg),
				React.createElement(
					'div',
					{ className: 'jarvis-tree-repo-summary' },
					entries.length === 0
						? '工作区干净'
						: entries.length + ' 个文件变更' + (additions + deletions > 0 ? ' · +' + additions + ' −' + deletions : ''),
				),
				React.createElement(
					'div',
					{ style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px' } },
					entries.length === 0
						? React.createElement(
								'div',
								{ style: { ...ui.hint, textAlign: 'center', paddingTop: 10 } },
								'没有未提交的更改',
							)
						: entries.map(([rel, status]) => {
								const name = pathBasename(rel)
								const diff = browser.gitDiffs ? browser.gitDiffs.get(rel) : null
								const abs = joinAbsPath(browser.root, rel)
								const rec = findOpenFileRecord(abs)
								return React.createElement(
									'button',
									{
										key: rel,
										type: 'button',
										className:
											'jarvis-tree-row' + (browser.selected === abs ? ' is-selected' : ''),
										style: { paddingLeft: 8 },
										title: rel + '\n双击打开（可编辑保存）',
										onClick: () => browser.setSelected(abs),
										onDoubleClick: () => {
											openFileInTab({ name, path: abs, size: 0 })
											openFileSidebar()
										},
									},
									React.createElement(
										'span',
										{ className: 'jarvis-tree-chevron', style: { visibility: 'hidden' } },
										renderSvgIcon('chevron-right', 12),
									),
									React.createElement('span', { className: 'jarvis-tree-glyph' }, renderSvgIcon(getFileIconKey(name), 14)),
									React.createElement(
										'span',
										{ className: 'jarvis-tree-name' + (rec ? ' is-open-file' : '') },
										name,
									),
									React.createElement(
										'span',
										{ className: 'jarvis-tree-meta', style: { color: GIT_COLORS[status] } },
										GIT_LABELS[status],
									),
									diff && (diff.additions > 0 || diff.deletions > 0)
										? React.createElement(
												'span',
												{ className: 'jarvis-tree-diff' },
												diff.additions > 0
													? React.createElement('span', { className: 'jarvis-tree-diff-add' }, '+' + diff.additions)
													: null,
												diff.deletions > 0
													? React.createElement('span', { className: 'jarvis-tree-diff-del' }, '-' + diff.deletions)
													: null,
											)
										: null,
									rec
										? React.createElement('span', { className: 'jarvis-tree-dot' + (rec.dirty ? ' dirty' : '') })
										: null,
								)
							}),
				),
			)
		}

		/** Git 操作导航栏（仓库视图顶部）：拉取 / 提交 / 推送 + 提交信息输入 +
		 *  结果反馈（orca SourceControl 的简化版；仅 git 仓库显示）。 */
		function renderGitOpsBar(browser, commitMsg, setCommitMsg) {
			const busy = browser.gitOp.busy
			const canCommit = !busy && commitMsg.trim().length > 0
			return React.createElement(
				'div',
				{ className: 'jarvis-tree-gitops' },
				// 行1：三个操作按钮（拉取 / 提交 / 推送）
				React.createElement(
					'div',
					{ className: 'jarvis-tree-gitops-row' },
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn jarvis-tree-gitop-btn',
							title: '拉取远程更新（git pull）',
							disabled: busy,
							onClick: () => browser.runGitOp('pull'),
						},
						renderSvgIcon('download', 12),
						' 拉取',
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn jarvis-tree-gitop-btn jarvis-tree-gitops-commit',
							title: '提交全部更改（git add -A + commit）',
							disabled: !canCommit,
							onClick: () => {
								browser.runGitOp('commit', commitMsg)
								setCommitMsg('')
							},
						},
						renderSvgIcon('git-branch', 12),
						' 提交',
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn jarvis-tree-gitop-btn',
							title: '推送到远程（git push）',
							disabled: busy,
							onClick: () => browser.runGitOp('push'),
						},
						renderSvgIcon('upload', 12),
						' 推送',
					),
					busy ? React.createElement('span', { className: 'jarvis-tree-spinner' }) : null,
				),
				// 行2：提交信息输入（Enter 提交）
				React.createElement(
					'div',
					{ className: 'jarvis-tree-gitops-row' },
					React.createElement('input', {
						type: 'text',
						className: 'jarvis-tree-gitops-input',
						value: commitMsg,
						placeholder: '提交信息…',
						spellCheck: false,
						disabled: busy,
						onChange: (e) => setCommitMsg(e.target.value),
						onKeyDown: (e) => {
							if (e.key === 'Enter' && canCommit) {
								e.preventDefault()
								browser.runGitOp('commit', commitMsg)
								setCommitMsg('')
							}
						},
					}),
				),
				// 行3：结果 / 错误反馈
				browser.gitOp.error
					? React.createElement('div', { className: 'jarvis-tree-gitops-msg is-error' }, browser.gitOp.error)
					: browser.gitOp.message
						? React.createElement('div', { className: 'jarvis-tree-gitops-msg' }, browser.gitOp.message)
						: null,
			)
		}

		/** 右侧栏：orca 风格文件树目录浏览器（details 座位；子座位由宿主声明）。 */
		function JarvisDetailsPanel(props) {
			const { sessionId, useSessions, closeDetails } = props
			const cwd = useSessions(
				(s) =>
					s && s.byId && sessionId && s.byId[sessionId] ? s.byId[sessionId].cwd : undefined,
			)
			const browser = useFileTreeBrowser(cwd || null)
			// 打开文件集合变化（新标签 / 保存 / 关闭）时重渲染树，刷新 ● 标记
			const [, bumpOpenFiles] = React.useReducer((x) => x + 1, 0)
			React.useEffect(() => {
				jarvisOpenFilesListeners.add(bumpOpenFiles)
				return () => jarvisOpenFilesListeners.delete(bumpOpenFiles)
			}, [])
			// 同步工作区根路径（终端 / 新建文件使用）
			React.useEffect(() => {
				jarvisWorkspaceCwd = browser.root || null
			}, [browser.root])
			const [commitMsg, setCommitMsg] = React.useState('')
			const [view, setView] = React.useState('files') // 'files' 目录树 | 'repo' git 仓库
			const rootName = browser.root ? pathBasename(browser.root) : ''
			return React.createElement(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 } },
				// orca 工具栏（h-8）：目录名 + 折叠全部 + 刷新 + 显示隐藏 + 关闭
				React.createElement(
					'div',
					{ className: 'jarvis-tree-toolbar' },
					React.createElement(
						'span',
						{ className: 'jarvis-tree-toolbar-name', title: browser.root || '' },
						rootName || '文件目录',
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn',
							title: '折叠全部',
							disabled: browser.expanded.size === 0 && browser.filterCollapsed.size === 0,
							onClick: browser.collapseAll,
						},
						renderSvgIcon('list-collapse', 14),
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn',
							title: '刷新',
							disabled: !browser.root,
							onClick: browser.refresh,
						},
						browser.anyLoading
							? React.createElement('span', { className: 'jarvis-tree-spinner' })
							: renderSvgIcon('refresh-cw', 14),
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn' + (browser.showDotfiles ? ' is-on' : ''),
							title: browser.showDotfiles ? '隐藏隐藏文件' : '显示隐藏文件',
							onClick: browser.toggleDotfiles,
						},
						renderSvgIcon(browser.showDotfiles ? 'eye' : 'eye-off', 14),
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-toolbtn',
							title: '关闭',
							onClick: () => {
								if (closeDetails) closeDetails()
								else closeFileSidebar()
							},
						},
						renderSvgIcon('x', 14),
					),
				),
				// 视图切换条：目录（文件树）| 仓库（git 变更 + 提交/推送/更新）
				React.createElement(
					'div',
					{ className: 'jarvis-tree-views' },
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-viewbtn' + (view === 'files' ? ' is-on' : ''),
							title: '工作区文件树',
							onClick: () => setView('files'),
						},
						'目录',
					),
					React.createElement(
						'button',
						{
							type: 'button',
							className: 'jarvis-tree-viewbtn' + (view === 'repo' ? ' is-on' : ''),
							title: 'Git 变更、提交、推送、更新',
							onClick: () => setView('repo'),
						},
						'仓库',
					),
				),
				// 内容区：目录视图 = Find files 过滤条 + 文件树；仓库视图 = git 面板
				view === 'repo'
					? renderGitRepoPanel(browser, commitMsg, setCommitMsg)
					: React.createElement(
							React.Fragment,
							null,
							// Find files 名称过滤条（orca FileExplorerNameFilter 同款）
							React.createElement(
								'div',
								{ className: 'jarvis-tree-filter' },
								React.createElement(
									'span',
									{ className: 'jarvis-tree-filter-icon' },
									renderSvgIcon('list-filter', 12),
								),
								React.createElement('input', {
									type: 'text',
									className: 'jarvis-tree-filter-input',
									value: browser.query,
									placeholder: 'Find files',
									'aria-label': 'Find files',
									spellCheck: false,
									onChange: (e) => browser.setQuery(e.target.value),
								}),
								browser.filterLoading
									? React.createElement(
											'span',
											{ className: 'jarvis-tree-filter-spin' },
											renderSvgIcon('loader-2', 12),
										)
									: null,
								browser.query
									? React.createElement(
											'button',
											{
												type: 'button',
												className: 'jarvis-tree-toolbtn jarvis-tree-filter-clear',
												title: '清除过滤',
												onClick: () => browser.setQuery(''),
											},
											renderSvgIcon('x', 12),
										)
									: null,
							),
							renderFileTreeRows(browser),
						),
			)
		}

		// ───────────────────────────────────────────────────────────────
		// Cordis 插件入口
		// ───────────────────────────────────────────────────────────────

		exports.name = 'jarvis-theme'
		exports.inject = ['theme', 'slots']

		exports.apply = function (ctx, config) {
			if (typeof document === 'undefined' || !ctx) return
			runtimeCtx = ctx
			ctx.effect(
				() => {
					// 1. 注册两套主题（夜航 / 昼光）。重复 id 会抛错（HMR
					//    重挂载场景），catch 后 setTheme 仍可指向旧注册项。
					let disposeDark
					let disposeLight
					try {
						disposeDark = ctx.theme.register({
							id: THEME_DARK,
							colorScheme: 'dark',
							tokens: DARK_TOKENS,
						})
						disposeLight = ctx.theme.register({
							id: THEME_LIGHT,
							colorScheme: 'light',
							tokens: LIGHT_TOKENS,
						})
					} catch (err) {
						console.error('[dsh-theme-jarvis] theme register failed:', err)
					}

					// 1b. 常驻 override 层由 applySettings 在下方建立（同一 source
					//     调用会整层替换）—— 无论内置偏好（light/dark/system）
					//     如何被 Host settings 回写，贾维斯色板始终叠加在
					//     当前配色上 —— 这是「启动即默认贾维斯」的关键。

					// 1c. 内置偏好异步加载（adopt）会把我们启动时的 setTheme
					//     回写成内置值；监听 theme/change 在非 system 模式下
					//     重新夺取目标主题（system 模式交由 override 层跟随），
					//     同时刷新壁纸遮罩的明暗配色。
					const onThemeChange = (snapshot) => {
						const mode = currentSettings.mode
						if (mode !== 'dark' && mode !== 'light') return
						const target = resolveThemeId(mode)
						if (snapshot.preference !== target) setTheme(ctx, mode)
						if (wallpaperInfo(currentSettings)) {
							applyWallpaper(currentSettings, snapshot.active && snapshot.active.colorScheme)
						}
					}
					if (ctx.on) ctx.on('theme/change', onThemeChange)

					// 2. 应用持久化偏好 + 特效脚手架
					const settings = loadSettings()
					ensureFxDom()
					injectStyles()
					applySettings(ctx, settings)
					if (settings.boot) playBoot()
					// 顶栏加号按钮 + 新建菜单（终端 / 新文件）
					startViewAddWatcher()
					// 非对话视图（文件 / 终端标签）隐藏官方输入框
					startComposerWatcher()

					// 2a. 输入框打字音效（仅 TEXTAREA，捕获阶段全局监听）
					const onTypingKeydownHandler = (e) => onTypingKeydown(e)
					if (typeof document !== 'undefined' && document.addEventListener) {
						document.addEventListener('keydown', onTypingKeydownHandler, true)
					}

					// 2b. 贾维斯全息粒子宠物：随对话/语音/主题状态实时变化
					let pet = null
					let petPoll = null
					try {
						pet = startPet()
						activePet = pet
						pet.setForm(settings.petForm || 'jarvis')
						pet.setScheme(document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light')
						const disposeVoice = wakeEngine.onStateChange((status) => pet && pet.setVoice(status))
						const disposeScheme = ctx.on
							? ctx.on('theme/change', (snapshot) => pet && pet.setScheme(snapshot.active.colorScheme))
							: () => {}
						const poll = () => {
							if (!pet) return
							pet.setConversation({
								streaming: !!document.querySelector("[class*='_pending']"),
								error: !!document.querySelector("[class*='_noticeError']"),
							})
							// 上下文使用率（≥80 时宠物持续警报红）
							pet.setContextPercent(readContextPercent())
						}
						petPoll = setInterval(poll, 500)
						// 保存清理句柄（dispose 时统一释放）
						var disposePetVoice = disposeVoice
						var disposePetScheme = disposeScheme
					} catch (err) {
						console.warn('[dsh-theme-jarvis] pet start failed:', err)
					}

					// 2c. 实时 token 消耗 → 宠物球体发热。不调用任何接口：
					// 直接读会话头部统计行里已显示的 "113 tok/s"（StatsLine，
					// 同一元素内含「首 token 平均 / TTFT avg」与 tok/s）。
					// 正在生成（_pending 存在）时按 tps 发热，空闲回落。
					let tokenPoll = null
					if (pet && typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
						try {
							const readTps = () => {
								const nodes = document.querySelectorAll('div,span,button')
								for (const el of nodes) {
									const text = el.textContent || ''
									if (!/(首 token 平均|TTFT avg)/.test(text) || !/tok\/s/.test(text)) continue
									const m = /([\d.]+)\s*tok\/s/.exec(text)
									if (m) return parseFloat(m[1]) || 0
								}
								// 兜底：任意叶子元素的 tok/s（头部统计未显示时）
								let best = 0
								for (const el of nodes) {
									if (el.children.length !== 0) continue
									const m = /([\d.]+)\s*tok\/s/.exec(el.textContent || '')
									if (m) {
										const tps = parseFloat(m[1]) || 0
										if (tps > best) best = tps
									}
								}
								return best
							}
							tokenPoll = setInterval(() => {
								if (!pet) return
								if (document.querySelector("[class*='_pending']")) {
									// 正在生成：按当前 tok/s 发热（60 tok/s ≈ 满发热）
									pet.setTokenHeat(Math.min(1, readTps() / 60))
								} else {
									pet.setTokenHeat(0)
								}
							}, 600)
						} catch (err) {
							console.warn('[dsh-theme-jarvis] token poll start failed:', err)
						}
					}

					// 3. 设置面板（slots 可用时注册；缺失时主题仍生效）
					const slots = ctx.get ? ctx.get('slots') : undefined
					// 布局服务：文件侧边栏开合（details 列）
					jarvisLayoutSvc = ctx.get ? ctx.get('layout') : null
					// slots 服务镜像：双击文件时动态注册/注销文件选项卡
					jarvisSlotSvc = slots || null
					if (slots && typeof slots.inject === 'function') {
						// 右侧栏：工作区文件目录查看器（官方支持替换 details 座位）。
						//
						// 同 settings.general.item 的遮蔽规则：宿主原生在
						// priority 0 注册了 details 座位（报错里是 x6），动态
						// client 模块不走 runner 的 allocatePriority 自动分配，
						// 不显式传 priority 则默认 0，与宿主行同优先级直接冲突
						// 抛错。必须传更低的 -1 才能遮蔽它（最低者渲染）。
						//
						// 子座位 conversation.details.tool 由宿主的 details 条目
						// 声明（x6），这里不得重复声明——重复会在 load-time 抛
						// "already declared"。宿主声明随其条目保留在槽树中，
						// 本面板不渲染该子座位，仅不再造成重复声明冲突。
						slots.inject('details', () =>
							slots.register(
								{
									name: 'details',
									priority: -1,
								},
								JarvisDetailsPanel,
							),
						)
						// 会话头部工具区：文件侧边栏开关按钮（点击开/关右侧栏）
						slots.inject('conversation.session.header.utilities', () =>
							slots.register(
								{
									name: 'conversation.session.header.utilities',
									id: 'jarvis-files-toggle',
									order: 50,
								},
								JarvisFilesToggle,
							),
						)
						slots.inject('settings.section', () =>
							slots.register(
								{
									name: 'settings.section',
									id: 'jarvis-console',
									order: 210,
									label: 'JARVIS 控制台',
								},
								() =>
									React.createElement(JarvisConsole, {
										settings,
										onChange: (next) => {
											saveSettings(next)
											applySettings(ctx, next)
										},
										onPlayBoot: playBoot,
									}),
							),
						)
						// 输入框工具栏：语音唤醒状态徽章（官方
						// conversation.input.right 契约，自动获得
						// useInput / inputActions）
						slots.inject('conversation.input.right', () =>
							slots.register(
								{
									name: 'conversation.input.right',
									id: 'jarvis-wake-chip',
									order: 35,
								},
								WakeChip,
							),
						)
						// 通用设置 → 外观：用同 id 替换官方行，让贾维斯
						// 主题成为外观选择器的一等选项（官方支持同 id
						// 替换单元格，slot 契约 replaceRisk: none）。
						//
						// 同 id 遮蔽的代价是 priority 必须与官方行不同，
						// 且"最低者渲染"（SlotCore.entriesOfSlot 按 priority
						// 升序取每 id 首条）。官方行由宿主原生注册在
						// priority 0，动态 client 模块不走 runner 的
						// allocatePriority 自动分配，因此必须显式传一个
						// 更低的优先级（-1）才能遮蔽它；不传则默认 0，
						// 与官方行同 priority 直接冲突抛错。
						slots.inject('settings.general.item', () =>
							slots.register(
								{
									name: 'settings.general.item',
									id: 'appearance',
									order: 10,
									priority: -1,
								},
								GeneralAppearanceRow,
							),
						)
					}

					// 4. 跟随系统：监听 OS 配色切换
					const mql =
						typeof window !== 'undefined' && window.matchMedia
							? window.matchMedia('(prefers-color-scheme: dark)')
							: null
					const onSysChange = () => {
						if (loadSettings().mode === 'system') setTheme(ctx, 'system')
					}
					if (mql && mql.addEventListener) mql.addEventListener('change', onSysChange)

					return () => {
						if (mql && mql.removeEventListener) mql.removeEventListener('change', onSysChange)
						if (typeof document !== 'undefined' && document.removeEventListener) {
							document.removeEventListener('keydown', onTypingKeydownHandler, true)
						}
						if (petPoll) clearInterval(petPoll)
						if (tokenPoll) clearInterval(tokenPoll)
						if (pet) pet.dispose()
						if (typeof disposePetVoice === 'function') disposePetVoice()
						if (typeof disposePetScheme === 'function') disposePetScheme()
						if (ctx.off) ctx.off('theme/change', onThemeChange)
						if (typeof overrideDisposer === 'function') overrideDisposer()
						teardownWallpaper()
						wakeEngine.dispose()
						stopViewAddWatcher()
						stopComposerWatcher()
						if (disposeDark) disposeDark()
						if (disposeLight) disposeLight()
					}
				},
				'dsh-theme-jarvis: themes, override layer, FX, pet, voice wake and settings rows',
			)
		}

		// 供冒烟测试与调试检查的内部导出（runner 会忽略）
		exports.__internals = {
			DARK_TOKENS,
			LIGHT_TOKENS,
			FX_CSS,
			DEFAULT_SETTINGS,
			loadSettings,
			saveSettings,
			applySettings,
			resolveThemeId,
			normalizeForWake,
			detectWake,
			extractAfterWake,
			pickSpeechLang,
			concatFloat32,
			resample16k,
			encodeWav,
			wakeEngine,
			loadWallpapers,
			saveWallpapers,
			normalizeWallpaper,
			wallpaperInfo,
			applyWallpaper,
			teardownWallpaper,
			parseColor,
			alphaColor,
			buildOverrideTokens,
			compressImage,
			readImageAsDataUrl,
			WALLPAPER_DEFAULT_URL,
			WALLPAPER_SURFACE_ALPHAS,
			WALLPAPER_MAX_BYTES,
			WALLPAPER_DATA_LIMIT,
			WALLPAPER_DEFAULT_OPACITY,
			WALLPAPER_DEFAULT_BLUR,
			onTypingKeydown,
			playKeyClick,
			playTypingSend,
			readContextPercent,
			hostRpc,
			friendlyBrowseError,
			openFileInTab,
			closeFileTab,
			openTerminalTab,
			closeTerminalTab,
			createNewFileTab,
			activateViewTabByLabel,
			JarvisTerminal,
			cleanTerminalText,
			startViewAddWatcher,
			stopViewAddWatcher,
			syncComposerVisibility,
			startComposerWatcher,
			stopComposerWatcher,
			flattenTreeRows,
			buildNameFilterRows,
			relativePathOf,
			isDotfileRel,
			shouldSkipSearchDir,
			buildGitStatusMaps,
			dominantGitStatus,
			toGitDiffMap,
			GIT_LABELS,
			GIT_COLORS,
			getFileIconKey,
			compareFileNames,
			pathBasename,
			ICON_SVG,
		}

		return module.exports
	},
})
