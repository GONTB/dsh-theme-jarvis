// dsh-theme-jarvis 冒烟测试：
// 1. 在 Node 中物化 client.js 的模块工厂（stub window.__ModuleLoader__）；
// 2. 校验 exports 形状（inject / apply / __internals）；
// 3. 校验两套 token 表的 key 集合一致、值非空；
// 4. 用假 ctx + 假 DOM 跑一遍 apply，确认 register×2、setTheme、样式注入与
//    特效脚手架都按预期发生，且 dispose 回调完整。
import assert from 'node:assert/strict'

// ── 假 DOM（apply 所需的最小面）──────────────────────────────────────
function makeFake2dContext() {
	return new Proxy(
		{},
		{
			get(target, key) {
				if (key === 'createRadialGradient' || key === 'createLinearGradient') {
					return () => ({ addColorStop() {} })
				}
				if (key in target) return target[key]
				return () => {}
			},
			set(target, key, value) {
				target[key] = value
				return true
			},
		},
	)
}

function makeFakeElement() {
	return {
		id: '',
		tagName: 'div',
		textContent: '',
		innerHTML: '',
		removed: false,
		style: {},
		offsetLeft: 0,
		offsetTop: 0,
		children: [],
		parentNode: null,
		classList: {
			_set: new Set(),
			toggle(name, on) {
				if (on) this._set.add(name)
				else this._set.delete(name)
			},
			add(name) { this._set.add(name) },
			remove(name) { this._set.delete(name) },
			contains(name) { return this._set.has(name) },
		},
		addEventListener() {},
		removeEventListener() {},
		appendChild(child) {
			this.children.push(child)
			child.parentNode = this
			return child
		},
		prepend(child) {
			this.children.unshift(child)
			child.parentNode = this
			return child
		},
		contains(child) { return this.children.includes(child) },
		removeChild(child) {
			const index = this.children.indexOf(child)
			if (index >= 0) {
				this.children.splice(index, 1)
				child.parentNode = null
			}
			return child
		},
		remove() {
			this.removed = true
			if (this.parentNode) this.parentNode.removeChild(this)
		},
		querySelector() { return makeFakeElement() },
		hasAttribute() { return false },
		setAttribute() {},
		setPointerCapture() {},
		getContext() { return makeFake2dContext() },
		toDataURL() { return 'data:image/jpeg;base64,AAAA' },
	}
}

const created = []
const docListeners = []
const documentStub = {
	hidden: false,
	body: makeFakeElement(),
	head: makeFakeElement(),
	documentElement: makeFakeElement(),
	addEventListener(type, fn, opts) {
		docListeners.push({ type, fn, opts })
	},
	removeEventListener(type, fn) {
		const index = docListeners.findIndex((l) => l.type === type && l.fn === fn)
		if (index >= 0) docListeners.splice(index, 1)
	},
	createElement(tag) {
		const el = makeFakeElement()
		el.tagName = tag
		created.push(el)
		return el
	},
	getElementById(id) {
		return created.find((el) => el.id === id) ?? null
	},
	querySelector() { return null },
}

// ── 捕获模块注册 ─────────────────────────────────────────────────────
const captured = {}
// 内存 localStorage：让 loadSettings / 壁纸库等持久化路径可测
const storage = new Map()
globalThis.window = {
	__ModuleLoader__: {
		load: (handoff) => { captured.handoff = handoff },
	},
	matchMedia: (query) => ({
		matches: query.includes('prefers-color-scheme: dark'),
		addEventListener() {},
		removeEventListener() {},
	}),
	localStorage: {
		getItem: (key) => (storage.has(key) ? storage.get(key) : null),
		setItem: (key, value) => storage.set(key, String(value)),
		removeItem: (key) => storage.delete(key),
	},
	requestAnimationFrame: () => 1,
	cancelAnimationFrame: () => {},
}
globalThis.document = documentStub

await import('../client.js')

assert.ok(captured.handoff, '模块必须通过 window.__ModuleLoader__.load 注册')
assert.equal(captured.handoff.id, 'dsh-theme-jarvis')

const fakeReact = { createElement: (type) => ({ type }), useState: (v) => [v, () => {}] }
const exports = captured.handoff.factory((name) => {
	if (name === 'react') return fakeReact
	throw new Error('unexpected require: ' + name)
})

// ── 1. exports 形状 ──────────────────────────────────────────────────
assert.equal(exports.name, 'jarvis-theme')
assert.deepEqual([...exports.inject].sort(), ['slots', 'theme'])
assert.equal(typeof exports.apply, 'function')
assert.ok(exports.__internals)

// ── 2. token 表一致性 ────────────────────────────────────────────────
const { DARK_TOKENS, LIGHT_TOKENS } = exports.__internals
const darkKeys = Object.keys(DARK_TOKENS).sort()
const lightKeys = Object.keys(LIGHT_TOKENS).sort()
assert.deepEqual(darkKeys, lightKeys, '两套 token 表的 key 集合必须完全一致')
for (const key of darkKeys) {
	assert.ok(typeof DARK_TOKENS[key] === 'string' && DARK_TOKENS[key].length > 0, `dark token ${key} 值非法`)
	assert.ok(typeof LIGHT_TOKENS[key] === 'string' && LIGHT_TOKENS[key].length > 0, `light token ${key} 值非法`)
	assert.ok(key.startsWith('--dsw-') || key.startsWith('--ds-'), `token 名必须以 --dsw-/--ds- 开头: ${key}`)
}
assert.ok(darkKeys.length >= 90, `token 覆盖不足: ${darkKeys.length}`)
assert.ok(darkKeys.every((k) => !k.includes('static')), '不得覆盖 --dsw-static-* 内部标尺')

// ── 3. apply 全链路 ──────────────────────────────────────────────────
const registered = []
const setThemeCalls = []
const overrideCalls = []
const themeListeners = []
const slotSections = []
const fakeCtx = {
	theme: {
		register(def) {
			registered.push(def)
			return () => {}
		},
		setTheme(id) { setThemeCalls.push(id) },
		overrideTokens(source, tokens) {
			overrideCalls.push({ source, tokens })
			return () => {}
		},
	},
	on(event, fn) {
		themeListeners.push({ event, fn })
		return () => {}
	},
	off() {},
	get(service) {
		if (service === 'slots') {
			return {
				inject(slot, fn) {
					const rec = { slot, fn }
					slotSections.push(rec)
					// 与真实框架一致：同步执行注入回调完成注册（返回 register 的 disposer）
					try {
						rec.result = fn()
					} catch (err) {
						rec.error = err
					}
					return rec
				},
				register(desc, render) {
					const entry = { desc, render, disposed: false }
					const dispose = () => {
						entry.disposed = true
					}
					dispose.desc = desc
					dispose.render = render
					dispose.isDisposed = () => entry.disposed
					return dispose
				},
			}
		}
		return undefined
	},
	effect(fn, label) {
		const dispose = fn()
		return { dispose, label }
	},
}

// cordis 约定：apply 的返回值被忽略，清理闭包经 ctx.effect 注册
const effects = []
fakeCtx.effect = (fn, label) => {
	const disposer = fn()
	effects.push({ disposer, label })
}
exports.apply(fakeCtx, {})
assert.equal(effects.length, 1, 'apply 必须通过 ctx.effect 注册清理闭包')
assert.equal(typeof effects[0].disposer, 'function')

assert.equal(registered.length, 2)
assert.deepEqual(
	registered.map((t) => [t.id, t.colorScheme]).sort(),
	[['jarvis-day', 'light'], ['jarvis-night', 'dark']],
)
assert.deepEqual(registered[0].tokens, DARK_TOKENS)
assert.equal(setThemeCalls.length, 1)
assert.equal(setThemeCalls[0], 'jarvis-night')

// 常驻 override 层：全部 token 的 { light, dark } 配对
assert.equal(overrideCalls.length, 1, '必须注册常驻 override 层')
assert.equal(overrideCalls[0].source, 'dsh-theme-jarvis')
const overrideTokens = overrideCalls[0].tokens
assert.deepEqual(Object.keys(overrideTokens).sort(), darkKeys, 'override 层 token 集合与主题 token 一致')
for (const key of darkKeys) {
	assert.equal(typeof overrideTokens[key].light, 'string', `override ${key} 缺 light 值`)
	assert.equal(typeof overrideTokens[key].dark, 'string', `override ${key} 缺 dark 值`)
}

// theme/change 再断言监听器（防 Host settings adopt 回写）
assert.ok(themeListeners.some((l) => l.event === 'theme/change'), '必须监听 theme/change')

assert.equal(
	slotSections.length,
	5,
	'必须注册 settings.section / conversation.input.right / settings.general.item / details / conversation.session.header.utilities 五个 slot',
)
assert.deepEqual(
	slotSections.map((s) => s.slot).sort(),
	[
		'conversation.input.right',
		'conversation.session.header.utilities',
		'details',
		'settings.general.item',
		'settings.section',
	],
)
// 头部工具区：文件侧边栏开关按钮（静态注册；文件选项卡是动态注册的）
const utilReg = slotSections.find((s) => s.slot === 'conversation.session.header.utilities')
assert.ok(utilReg, '必须注册头部文件开关按钮')
assert.equal(utilReg.fn().desc.id, 'jarvis-files-toggle')
// 右侧栏目录查看器：注册到 details。
const detailsReg = slotSections.find((s) => s.slot === 'details')
assert.ok(detailsReg, '必须注册右侧栏目录查看器')
// details 替换宿主原生 details 座位：宿主在 priority 0 注册（load 报错里的 x6），
// 同 settings.general.item 遮蔽规则——必须显式传更低的 priority: -1
//（最低者渲染），否则与宿主行同 priority 在 load-time 直接抛冲突错。
assert.equal(detailsReg.fn().desc.priority, -1, '替换 details 座位必须显式传 priority: -1')
// 子座位 conversation.details.tool 由宿主的 details 条目（x6）声明；这里
// 不得重复声明——重复声明会在 load-time 抛 "slot ... is already declared"。
assert.equal(
	detailsReg.fn().desc.children,
	undefined,
	'不得重复声明 conversation.details.tool 子座位（宿主 x6 已声明）',
)
const appearanceReg = slotSections.find((s) => s.slot === 'settings.general.item')
assert.ok(appearanceReg, '必须注册外观行')
// 替换官方外观行：注册 id 必须是 appearance
const appearanceDesc = appearanceReg.fn().desc
assert.equal(appearanceDesc.id, 'appearance')
// 同 id 遮蔽要求 priority 低于官方行的 0（"最低者渲染"）：
// 官方行原生注册在 priority 0，同 id 同 priority 会在
// load-time 直接抛错（"register at a different priority to shadow it"）。
assert.equal(appearanceDesc.priority, -1, '替换官方外观行必须显式传 priority: -1')

const style = created.find((el) => el.id === 'dsh-theme-jarvis-fx')
assert.ok(style, 'FX 样式必须注入')
assert.ok(style.textContent.includes('jarvisBootFade'))
assert.ok(style.textContent.includes('jarvis-wake-hud'), 'FX 样式必须包含唤醒 HUD')
assert.ok(style.textContent.includes('jarvis-pet'), 'FX 样式必须包含宠物')
assert.ok(style.textContent.includes('#jarvis-wallpaper'), 'FX 样式必须包含壁纸层规则')
// 回归守卫：backdrop-filter / filter 会让元素成为 fixed 后代的包含块，
// 把设置模态框（sidebar.settings 子树内）吸到侧边栏位置 —— 绝不允许
assert.ok(
	!style.textContent.includes('backdrop-filter'),
	'FX 样式严禁使用 backdrop-filter（会把设置模态框吸进侧边栏）',
)

assert.ok(created.some((el) => el.id === 'jarvis-scanlines'), '扫描线层必须创建')
assert.ok(created.some((el) => el.id === 'jarvis-vignette'), '暗角层必须创建')
assert.ok(created.some((el) => el.id === 'jarvis-wake-hud'), '唤醒 HUD 层必须创建')
assert.ok(created.some((el) => el.id === 'jarvis-pet'), '液态球宠物 canvas 必须创建')
assert.ok(created.some((el) => el.id === 'jarvis-boot'), '默认开启开机动画时必须创建启动层')
assert.ok(documentStub.body.classList.contains('jarvis-scanlines'))
assert.ok(documentStub.body.classList.contains('jarvis-glow'))
assert.ok(documentStub.body.classList.contains('jarvis-pet-on'), '宠物默认开启')
// 默认无壁纸：不创建壁纸层、body 不挂类，override 层保持原值
assert.ok(!documentStub.body.classList.contains('jarvis-wallpaper'), '默认不启用壁纸')
assert.ok(!created.some((el) => el.id === 'jarvis-wallpaper'), '默认不创建壁纸层 div')
assert.equal(
	overrideCalls[0].tokens['--dsw-alias-bg-base'].dark,
	DARK_TOKENS['--dsw-alias-bg-base'],
	'无壁纸时 override 层保持原始表面色',
)

// 打字音效：必须注册 document 级 keydown 捕获监听
assert.ok(
	docListeners.some((l) => l.type === 'keydown' && l.opts === true),
	'必须注册输入框打字音效的 keydown 捕获监听',
)

// ── 4. 模式解析 ──────────────────────────────────────────────────────
assert.equal(exports.__internals.resolveThemeId('dark'), 'jarvis-night')
assert.equal(exports.__internals.resolveThemeId('light'), 'jarvis-day')
assert.equal(exports.__internals.resolveThemeId('system'), 'system', '跟随系统交还内置 system 偏好')

// ── 5. 唤醒词匹配 ────────────────────────────────────────────────────
const { detectWake, extractAfterWake, pickSpeechLang, wakeEngine } = exports.__internals
assert.equal(detectWake('贾维斯，帮我写个总结', '贾维斯'), true, '中文唤醒词（含标点）')
assert.equal(detectWake('Jarvis, open settings', 'JARVIS'), true, '英文唤醒词忽略大小写')
assert.equal(detectWake('帮我把灯打开', '贾维斯'), false, '未出现唤醒词时不误报')
// 模糊匹配：容忍中文单字同音/误识（编辑距离 ≤1），但不匹配截断词
assert.equal(detectWake('加维斯，帮我写个总结', '贾维斯'), true, '同音字替换仍能唤醒')
assert.equal(detectWake('贾维司', '贾维斯'), true, '末字误识仍能唤醒')
assert.equal(detectWake('贾维', '贾维斯'), false, '截断的唤醒词不匹配（压误报）')
assert.equal(extractAfterWake('贾维斯，帮我写个总结', '贾维斯'), '帮我写个总结', '一句话唤醒提取指令（剥离标点）')
assert.equal(extractAfterWake('加维斯帮我写个总结', '贾维斯'), '帮我写个总结', '模糊命中同样剥离唤醒词')
assert.equal(extractAfterWake('Hey Jarvis, hello', 'jarvis'), 'hello', '英文提取唤醒词之后内容（剥离标点）')
assert.equal(pickSpeechLang('贾维斯'), 'zh-CN')
assert.equal(pickSpeechLang('jarvis'), 'en-US')

// ── 5b. 打字音效 ─────────────────────────────────────────────────────
const { onTypingKeydown } = exports.__internals
assert.equal(exports.__internals.DEFAULT_SETTINGS.typingSfx, true, '打字音效默认开启')
exports.__internals.saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, typingSfx: false })
assert.equal(exports.__internals.loadSettings().typingSfx, false, '打字音效可持久化关闭')
exports.__internals.saveSettings({ ...exports.__internals.DEFAULT_SETTINGS })
// 守卫：非 TEXTAREA / 修饰键 不发声也不抛错（Node 无 AudioContext，静默 no-op）
onTypingKeydown({ target: { tagName: 'DIV' }, key: 'a' })
onTypingKeydown({ target: { tagName: 'TEXTAREA' }, key: 'a', metaKey: true })
onTypingKeydown({ target: { tagName: 'TEXTAREA' }, key: 'Enter', metaKey: false, ctrlKey: false, altKey: false })
onTypingKeydown({ target: { tagName: 'TEXTAREA' }, key: 'a', metaKey: false, ctrlKey: false, altKey: false })
onTypingKeydown(null)

// ── 5c. 上下文使用率读取（读界面 aria-label，不调接口）───────────────
const savedDocument = globalThis.document
globalThis.document = {
	querySelectorAll: (sel) => [
		{ getAttribute: () => (sel === 'button' ? '上下文已用 82%' : null), children: [] },
	],
}
assert.equal(exports.__internals.readContextPercent(), 82, 'zh aria-label 命中上下文百分比')
globalThis.document = {
	querySelectorAll: (sel) => [
		{ getAttribute: () => (sel === 'button' ? '38% of context used' : null), children: [] },
	],
}
assert.equal(exports.__internals.readContextPercent(), 38, 'en aria-label 命中上下文百分比')
globalThis.document = {
	querySelectorAll: (sel) =>
		sel === 'button' ? [] : [{ children: [], textContent: '97%' }],
}
assert.equal(exports.__internals.readContextPercent(), 97, '兜底叶子百分比')
globalThis.document = savedDocument

// ── 5d. 文件浏览：host 信封 RPC + 打开文件通知 ───────────────────────
{
	const savedFetch = globalThis.window.fetch
	globalThis.window.fetch = async (url, opts) => {
		assert.ok(url.endsWith('/api/host.listDirectory'), '必须走官方信封端点')
		const body = JSON.parse(opts.body)
		assert.equal(body.type, 'client-request')
		assert.equal(body.method, 'host.listDirectory')
		assert.deepEqual(body.payload, { path: '/proj' })
		return {
			ok: true,
			json: async () => ({
				type: 'server-response',
				rpcId: body.rpcId,
				result: {
					ok: true,
					value: {
						path: '/proj',
						home: '/',
						crumbs: [],
						entries: [
							{ name: 'a.txt', path: '/proj/a.txt', hidden: false },
							{ name: '.git', path: '/proj/.git', hidden: true },
						],
						truncated: false,
					},
				},
			}),
		}
	}
	const value = await exports.__internals.hostRpc('host.listDirectory', { path: '/proj' })
	assert.equal(value.entries.length, 2, '信封 RPC 返回条目')
	globalThis.window.fetch = savedFetch

	// browse 能力缺失（宿主目录选择器仅服务 native）时，错误被翻译成可操作提示
	const { friendlyBrowseError } = exports.__internals
	assert.ok(
		friendlyBrowseError('host.listDirectory needs the browse capability; the composed picker serves "native"').includes('browse'),
		'browse 能力缺失错误必须翻译为中文指引',
	)
	assert.ok(
		friendlyBrowseError('host.createDirectory needs the browse capability; the composed picker serves "native"').includes('browse'),
		'createDirectory 同类能力错误同样翻译',
	)
	assert.equal(friendlyBrowseError('disk full'), 'disk full', '无关错误原样透传')
	assert.equal(friendlyBrowseError(''), '无法列出目录', '空错误兜底默认文案')

	// 打开文件 → 动态注册文件选项卡（conversation.view 条目），
	// 同一文件不重复注册，关闭后注销。
	assert.equal(
		slotSections.filter((s) => s.slot === 'conversation.view').length,
		0,
		'初始无静态文件选项卡',
	)
	exports.__internals.openFileInTab({ name: 'a.txt', path: '/proj/a.txt' })
	assert.equal(slotSections.filter((s) => s.slot === 'conversation.view').length, 1, '双击文件必须动态注册选项卡')
	const dynReg = slotSections.find((s) => s.slot === 'conversation.view')
	const dynEntry = dynReg.result // inject 返回 fn() 的返回 = register 的 disposer
	assert.equal(dynEntry.desc.id, 'jarvis-file-1', '动态选项卡 id 唯一递增')
	assert.equal(typeof dynEntry.desc.label, 'function', 'label 为 thunk（编辑后显示 ●）')
	assert.equal(dynEntry.desc.label(), 'a.txt', '未编辑时 label = 文件名')
	exports.__internals.openFileInTab({ name: 'a.txt', path: '/proj/a.txt' })
	assert.equal(
		slotSections.filter((s) => s.slot === 'conversation.view').length,
		1,
		'同一文件重复打开不重复注册',
	)
	exports.__internals.closeFileTab('jarvis-file-1')
	assert.equal(dynEntry.isDisposed(), true, '关闭文件选项卡必须注销动态条目')
}

// ── 5e. orca 风格文件树：扁平化行投影 + SVG 线性图标 ─────────────────
{
	const { flattenTreeRows, getFileIconKey, compareFileNames, ICON_SVG } = exports.__internals

	// 文件类型图标：lucide 线性 SVG（禁用 emoji）——扩展名映射 / 大小写
	// 不敏感 / 特殊文件名优先 / 复合扩展名 / 兜底
	assert.equal(getFileIconKey('index.js'), 'file-code', '代码文件图标')
	assert.equal(getFileIconKey('photo.PNG'), 'file-image', '扩展名大小写不敏感')
	assert.equal(getFileIconKey('Dockerfile'), 'file-cog', 'dockerfile 文件名优先')
	assert.equal(getFileIconKey('Makefile'), 'file-terminal', 'makefile → 终端图标')
	assert.equal(getFileIconKey('.env'), 'file-lock', '.env → 锁图标')
	assert.equal(getFileIconKey('bundle.tar.gz'), 'file-archive', '复合扩展名 tar.gz 优先匹配')
	assert.equal(getFileIconKey('noext'), 'file', '无扩展名兜底为通用文件')
	for (const key of ['file', 'file-text', 'file-code', 'file-image', 'folder', 'folder-open', 'chevron-right', 'alert-circle', 'refresh-cw', 'list-collapse', 'x']) {
		assert.ok(
			typeof ICON_SVG[key] === 'string' &&
				ICON_SVG[key].startsWith('<') &&
				/<\/?(path|circle|line|rect|ellipse|polyline)/.test(ICON_SVG[key]) &&
				!ICON_SVG[key].includes('<svg'),
			`ICON_SVG.${key} 必须是内联 SVG 元素（非 emoji、非嵌套 svg 标签）`,
		)
	}
	assert.ok(!ICON_SVG.file.includes('📄'), '图标不得使用 emoji')
	assert.equal(compareFileNames('file10', 'file2') > 0, true, '名称排序数字感知')

	// 扁平化行投影（orca flatten 同款）：目录在前（缓存已排序）、
	// 展开目录递归下钻、未展开不下钻、深度递增
	const cache = {
		'/root': {
			entries: [
				{ name: 'src', path: '/root/src', kind: 'dir' },
				{ name: 'b.txt', path: '/root/b.txt', kind: 'file' },
				{ name: 'a.txt', path: '/root/a.txt', kind: 'file' },
			],
			loading: false,
			error: '',
		},
		'/root/src': {
			entries: [{ name: 'deep.js', path: '/root/src/deep.js', kind: 'file' }],
			loading: false,
			error: '',
		},
	}
	const rows = flattenTreeRows(cache, new Set(['/root/src']), '/root')
	assert.deepEqual(rows.map((r) => r.kind), ['dir', 'file', 'file', 'file'])
	assert.equal(rows[0].entry.path, '/root/src', '目录行保持原序')
	assert.equal(rows[1].entry.path, '/root/src/deep.js', '展开目录就地递归下钻')
	assert.equal(rows[1].depth, 1, '子目录行深度 +1')
	assert.equal(rows[2].entry.path, '/root/b.txt', '下钻后回到同级条目')
	assert.equal(flattenTreeRows(cache, new Set(), '/root').length, 3, '未展开目录不递归')

	// 加载中 / 出错子目录 → 行内状态行（orca InlineStatusNode 同款）
	const loadingCache = {
		'/root': { entries: [{ name: 'slow', path: '/root/slow', kind: 'dir' }], loading: false, error: '' },
		'/root/slow': { entries: [], loading: true, error: '' },
	}
	assert.equal(
		flattenTreeRows(loadingCache, new Set(['/root/slow']), '/root')[1].kind,
		'loading',
		'加载中子目录显示行内加载行',
	)
	const errorCache = {
		'/root': { entries: [{ name: 'bad', path: '/root/bad', kind: 'dir' }], loading: false, error: '' },
		'/root/bad': { entries: [], loading: false, error: '权限不足' },
	}
	const errorRows = flattenTreeRows(errorCache, new Set(['/root/bad']), '/root')
	assert.equal(errorRows[1].kind, 'error')
	assert.equal(errorRows[1].message, '权限不足', '行内错误行带可读信息')

	// showDotfiles（orca Show Dotfiles）：false 时隐藏项跳过，true 时显示
	const dotCache = {
		'/root': {
			entries: [
				{ name: '.git', path: '/root/.git', kind: 'dir', hidden: true },
				{ name: 'a.txt', path: '/root/a.txt', kind: 'file' },
			],
			loading: false,
			error: '',
		},
	}
	assert.equal(flattenTreeRows(dotCache, new Set(), '/root', false).length, 1, '隐藏隐藏文件')
	assert.equal(flattenTreeRows(dotCache, new Set(), '/root', true).length, 2, '显示隐藏文件')

	// Find files 名称过滤投影（orca file-explorer-name-filter-projection 同款）：
	// 命中文件 → 合成祖先目录树（目录在前、深度=段下标），空查询返回 null
	const { buildNameFilterRows, relativePathOf, isDotfileRel, shouldSkipSearchDir } = exports.__internals
	assert.equal(relativePathOf('/root/src/deep.js', '/root'), 'src/deep.js', '相对路径剥离根')
	assert.equal(relativePathOf('/root2/x', '/root'), '', '前缀误配（/root2 不是 /root 子路径）必须拒绝')
	assert.equal(relativePathOf('/other/x', '/root'), '', '根外路径不匹配')
	assert.equal(isDotfileRel('.git/head'), true, '隐藏段识别')
	assert.equal(isDotfileRel('src/a.js'), false)
	// 噪声目录（gitignored 类）：node_modules 始终跳过；.git 仅当显示隐藏文件时可见
	assert.equal(shouldSkipSearchDir('node_modules', true), true, 'node_modules 始终跳过')
	assert.equal(shouldSkipSearchDir('dist', false), true)
	assert.equal(shouldSkipSearchDir('.git', false), true, '隐藏隐藏文件时跳过 .git')
	assert.equal(shouldSkipSearchDir('.git', true), false, '显示隐藏文件时允许搜 .git')
	assert.equal(shouldSkipSearchDir('src', true), false, '普通目录不跳过')
	const filterCache = {
		'/root': {
			entries: [
				{ name: 'src', path: '/root/src', kind: 'dir' },
				{ name: 'notes.md', path: '/root/notes.md', kind: 'file' },
			],
			loading: false,
			error: '',
		},
		'/root/src': {
			entries: [
				{ name: 'deep.js', path: '/root/src/deep.js', kind: 'file' },
				{ name: 'readme.txt', path: '/root/src/readme.txt', kind: 'file' },
			],
			loading: false,
			error: '',
		},
	}
	assert.equal(buildNameFilterRows(filterCache, '/root', '', true, new Set()), null, '空查询返回 null')
	const deepRows = buildNameFilterRows(filterCache, '/root', 'deep', true, new Set())
	assert.deepEqual(deepRows.map((r) => [r.kind, r.entry.name, r.depth]), [
		['dir', 'src', 0],
		['file', 'deep.js', 1],
	], '命中文件带合成祖先目录，深度=路径段下标')
	assert.equal(deepRows[0].synthetic, true, '合成目录带 synthetic 标记')
	assert.equal(deepRows[1].entry.path, '/root/src/deep.js', '文件行携带真实绝对路径')
	const multiRows = buildNameFilterRows(filterCache, '/root', 'read', true, new Set())
	assert.equal(multiRows.length, 2, '多词/包含匹配均可命中')
	assert.equal(multiRows[1].entry.name, 'readme.txt')
	// 合成目录收起：collapsed 含 src → 只剩目录行
	const collapsedRows = buildNameFilterRows(filterCache, '/root', 'deep', true, new Set(['src']))
	assert.deepEqual(collapsedRows.map((r) => r.entry.name), ['src'], '收起的合成目录不下钻')
	assert.deepEqual(buildNameFilterRows(filterCache, '/root', 'zzz', true, new Set()), [], '无命中 → 空数组')
	// 隐藏文件过滤：false 时 .env 不出现
	const dotFilterCache = {
		'/root': {
			entries: [
				{ name: '.env', path: '/root/.env', kind: 'file', hidden: true },
				{ name: 'env.js', path: '/root/env.js', kind: 'file' },
			],
			loading: false,
			error: '',
		},
	}
	assert.equal(buildNameFilterRows(dotFilterCache, '/root', 'env', false, new Set()).length, 1, '隐藏隐藏文件')
	assert.equal(buildNameFilterRows(dotFilterCache, '/root', 'env', true, new Set()).length, 2, '显示隐藏文件')
	// 噪声目录在搜索结果中排除：node_modules 内文件不可见（无论眼睛开关）
	const noiseFilterCache = {
		'/root': {
			entries: [
				{ name: 'node_modules', path: '/root/node_modules', kind: 'dir' },
				{ name: 'deep.js', path: '/root/deep.js', kind: 'file' },
			],
			loading: false,
			error: '',
		},
		'/root/node_modules': {
			entries: [{ name: 'deep.js', path: '/root/node_modules/deep.js', kind: 'file' }],
			loading: false,
			error: '',
		},
	}
	assert.equal(
		buildNameFilterRows(noiseFilterCache, '/root', 'deep', true, new Set()).length,
		1,
		'搜索排除 node_modules 噪声',
	)
	assert.equal(
		buildNameFilterRows(noiseFilterCache, '/root', 'deep', true, new Set())[0].entry.name,
		'deep.js',
		'只命中根目录自身的 deep.js',
	)

	// Git 状态映射（对齐 orca status-display.ts）：文件状态表 + 目录聚合、
	// deleted 不向上传播、主导状态优先级
	const { buildGitStatusMaps, dominantGitStatus, GIT_LABELS } = exports.__internals
	assert.equal(GIT_LABELS.modified, 'M', '状态标签与 orca 一致')
	assert.equal(GIT_LABELS.untracked, 'U')
	const gitMaps = buildGitStatusMaps({
		'src/a.js': 'modified',
		'src/b.js': 'added',
		'src/gone.ts': 'deleted',
		'root.txt': 'untracked',
	})
	assert.equal(gitMaps.byPath.get('src/a.js'), 'modified', '文件状态入表')
	assert.equal(gitMaps.folders.get('src'), 'modified', '目录聚合取主导状态（modified>added）')
	assert.equal(gitMaps.folders.get('root.txt'), undefined, '根级文件不入目录表')
	assert.equal(buildGitStatusMaps({ 'x/y.ts': 'deleted' }).folders.has('x'), false, 'deleted 不向上传播')
	assert.equal(dominantGitStatus(['added', 'modified']), 'modified', 'modified(4) > added(3)')
	assert.equal(dominantGitStatus(['untracked', 'renamed']), 'untracked', 'untracked(3) > renamed(2)')

	// 增删行数 Map：过滤非法/缺失字段
	const diffMap = exports.__internals.toGitDiffMap({
		'a.js': { additions: 5, deletions: 2 },
		'b.js': { additions: 1, deletions: 0 },
		'bad.js': { additions: 'x', deletions: 0 },
		'none.js': undefined,
	})
	assert.deepEqual(diffMap.get('a.js'), { additions: 5, deletions: 2 }, '行数入表')
	assert.equal(diffMap.get('bad.js'), undefined, '非法行数过滤')
	assert.equal(diffMap.get('none.js'), undefined, '缺失条目过滤')

	// 终端输出清洗：剥离 ANSI 转义 + READY 握手标记 + \r 归一，中文保留
	const { cleanTerminalText } = exports.__internals
	assert.equal(
		cleanTerminalText('\x1b[32mOK\x1b[0m\r\n\u4e2d\u6587'),
		'OK\n\u4e2d\u6587',
		'ANSI 颜色转义剥离且中文保留',
	)
	assert.equal(cleanTerminalText('__JARVIS_READY__\r\nPS>'), '\nPS>', 'READY 握手标记剥离')
	assert.equal(cleanTerminalText('\r\n'), '\n', 'CRLF 归一')

	// 收款码大图预览：挂到 body，关闭后移除
	const { showQrPreview, closeQrPreview } = exports.__internals
	showQrPreview()
	const qrOverlay = documentStub.body.children.find((el) => el.className === 'jarvis-qr-preview')
	assert.ok(qrOverlay, '预览遮罩必须挂到 body')
	assert.ok(
		qrOverlay.children.some((el) => el.tagName === 'img' && String(el.src || '').includes('donate/qrcode')),
		'预览内含收款码大图',
	)
	closeQrPreview()
	assert.ok(
		!documentStub.body.children.some((el) => el.className === 'jarvis-qr-preview'),
		'关闭后预览遮罩移除',
	)

	// 语法高亮（VS Code 风格）：关键字 / 字符串 / 注释 / 函数 / JSON 键 / 转义
	const { getHighlightLang, highlightToHtml } = exports.__internals
	assert.equal(getHighlightLang('index.js'), 'js', 'js 扩展名映射')
	assert.equal(getHighlightLang('App.tsx'), 'ts', 'tsx 映射 ts')
	assert.equal(getHighlightLang('hello.txt'), null, '未知扩展名不高亮')
	const jsHtml = highlightToHtml('const x = "hi"; // 注释\nfunction add() {}', 'js')
	assert.ok(jsHtml.includes('hl-keyword'), '关键字高亮')
	assert.ok(jsHtml.includes('hl-string'), '字符串高亮')
	assert.ok(jsHtml.includes('hl-comment'), '行注释高亮')
	assert.ok(jsHtml.includes('hl-function'), '函数调用高亮（后跟括号）')
	const jsonHtml = highlightToHtml('{ "name": 42 }', 'json')
	assert.ok(jsonHtml.includes('hl-property'), 'JSON 键高亮')
	assert.ok(jsonHtml.includes('hl-number'), '数字高亮')
	const blockHtml = highlightToHtml('/* 开始\n中间\n结束 */', 'js')
	assert.ok(blockHtml.includes('hl-comment'), '多行块注释跨行高亮')
	const escHtml = highlightToHtml('<div class="a">', 'html')
	assert.ok(!escHtml.includes('<div') || escHtml.includes('&lt;div'), 'HTML 必须转义避免注入')
	assert.ok(escHtml.includes('hl-string'), 'html 字符串属性高亮')

	// 树样式注入：行 / 箭头 / 选中态 / ● 标记 / 过滤条类必须进 FX 样式（且无 backdrop-filter）
	assert.ok(style.textContent.includes('.jarvis-tree-row'), '文件树行样式必须注入')
	assert.ok(style.textContent.includes('.jarvis-tree-dot'), '打开文件 ● 标记样式必须注入')
	assert.ok(style.textContent.includes('.jarvis-tree-filter'), 'Find files 过滤条样式必须注入')
	assert.ok(style.textContent.includes('.jarvis-tree-toolbar'), 'orca 工具栏样式必须注入')
	assert.ok(!style.textContent.includes('backdrop-filter'), '树样式同样禁止 backdrop-filter')
}

// ── 6. 引擎在不支持的环境下降级 ──────────────────────────────────────
assert.equal(wakeEngine.getState(), 'off', '默认关闭')
wakeEngine.configure({ voice: true, wakeWord: '贾维斯' })
assert.equal(wakeEngine.getState(), 'unsupported', '无 SpeechRecognition 时降级为 unsupported')
wakeEngine.configure({ voice: false, wakeWord: '贾维斯' })
assert.equal(wakeEngine.getState(), 'off', '关闭后回到 off')

// ── 7. 背景壁纸：颜色工具 / 半透明 override / 压缩 / 本机壁纸库 ──────
const {
	buildOverrideTokens,
	parseColor,
	alphaColor,
	applyWallpaper,
	loadWallpapers,
	saveWallpapers,
	normalizeWallpaper,
	wallpaperInfo,
	applySettings,
	saveSettings,
	compressImage,
	readImageAsDataUrl,
} = exports.__internals

assert.deepEqual(parseColor('#3BDCF4'), { r: 59, g: 220, b: 244, a: 1 })
assert.deepEqual(parseColor('#f5b33c'), { r: 245, g: 179, b: 60, a: 1 })
assert.equal(parseColor('rgba(59, 220, 244, 0.5)').a, 0.5)
assert.equal(parseColor('rgb(10, 20, 30)').a, 1)
assert.equal(parseColor('not-a-color'), null)
assert.equal(alphaColor('rgba(59, 220, 244, 0.5)', 0.5), 'rgba(59, 220, 244, 0.25)', 'alpha 只降不升')
assert.equal(alphaColor('#0A1424', 0.66), 'rgba(10, 20, 36, 0.66)', 'hex → 半透明 rgba')

// 壁纸激活时表面 token 变半透明，文字/边框保持不透明
const translucent = buildOverrideTokens(true, 1)
const raw = buildOverrideTokens(false, 1)
assert.ok(translucent['--dsw-alias-bg-base'].dark.startsWith('rgba('), 'bg-base 必须变半透明')
assert.notEqual(translucent['--dsw-alias-bg-base'].dark, raw['--dsw-alias-bg-base'].dark)
assert.equal(
	translucent['--dsw-alias-label-primary'].dark,
	raw['--dsw-alias-label-primary'].dark,
	'文字 token 保持不透明',
)
assert.deepEqual(Object.keys(translucent).sort(), darkKeys, '壁纸模式 token 集合不变')

// 表面不透明度滑块：0.5 时表面 alpha 减半（0.78 × 0.5 = 0.39）
assert.equal(translucent['--dsw-alias-bg-base'].dark, 'rgba(5, 11, 20, 0.78)')
assert.equal(buildOverrideTokens(true, 0.5)['--dsw-alias-bg-base'].dark, 'rgba(5, 11, 20, 0.39)')
assert.equal(buildOverrideTokens(true, 0.2)['--dsw-alias-bg-base'].dark, 'rgba(5, 11, 20, 0.156)')

// applyWallpaper：固定 div 垫底（cover + 遮罩 + blur），关闭后移除
assert.equal(applyWallpaper({ wallpaper: 'default' }, 'dark'), true)
const wpDiv = created.find((el) => el.id === 'jarvis-wallpaper')
assert.ok(wpDiv, '壁纸层 div 必须创建')
assert.ok(documentStub.body.classList.contains('jarvis-wallpaper'))
assert.ok(documentStub.body.contains(wpDiv), '壁纸层必须挂到 body 最前')
assert.ok(String(wpDiv.style.backgroundImage).includes('api/dsh-theme-jarvis/wallpaper/default'), '默认壁纸指向 host 静态路由')
assert.ok(String(wpDiv.style.backgroundImage).includes('linear-gradient'), '壁纸必须叠加遮罩')
assert.equal(wpDiv.style.filter, 'none', '默认无模糊')
applyWallpaper({ wallpaper: 'default', wallpaperBlur: 12 }, 'dark')
assert.equal(wpDiv.style.filter, 'blur(12px)', '模糊滑块作用于壁纸层')
assert.equal(applyWallpaper({ wallpaper: 'none' }, 'dark'), false)
assert.ok(!documentStub.body.classList.contains('jarvis-wallpaper'))
assert.ok(!documentStub.body.contains(wpDiv), '关闭后壁纸层 div 被移除')
assert.equal(wallpaperInfo({ wallpaper: 'none' }), null)
assert.equal(wallpaperInfo({ wallpaper: 'default' }).url, exports.__internals.WALLPAPER_DEFAULT_URL)

// 图片压缩：canvas 降采样（1600 上限）；Node 无 Image → 回退原始 dataURL
const compressed = compressImage({ width: 2000, height: 1000 }, 1600, 0.75)
assert.equal(compressed, 'data:image/jpeg;base64,AAAA')
const scaledCanvas = created.filter((el) => el.tagName === 'canvas').find((el) => el.width === 1600)
assert.ok(scaledCanvas, '压缩必须按最大边降采样')
assert.equal(scaledCanvas.height, 800)
assert.equal(exports.__internals.WALLPAPER_DATA_LIMIT, 2 * 1024 * 1024, '压缩目标 ≤2MB')

// 本机壁纸库：保存 / 加载 / 校验
const fakeWp = { id: 'wp-test', name: '测试壁纸', dataUrl: 'data:image/png;base64,AAAA' }
saveWallpapers([fakeWp])
assert.deepEqual(loadWallpapers(), [fakeWp])
assert.equal(normalizeWallpaper('user:wp-test'), 'user:wp-test')
assert.equal(normalizeWallpaper('user:missing'), 'none')
assert.equal(wallpaperInfo({ wallpaper: 'user:wp-test' }).name, '测试壁纸')
saveWallpapers([])

// 设置持久化：wallpaper / 不透明度 / 模糊 随 loadSettings 往返 + 钳位
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, wallpaper: 'default' })
assert.equal(exports.__internals.loadSettings().wallpaper, 'default')
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, sttBackend: 'local' })
assert.equal(exports.__internals.loadSettings().sttBackend, 'local', '本地离线后端可持久化')
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, sttBackend: 'bogus' })
assert.equal(exports.__internals.loadSettings().sttBackend, 'auto', '非法后端回退 auto')
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, wallpaper: 'user:ghost' })
assert.equal(exports.__internals.loadSettings().wallpaper, 'none', '失效的用户壁纸回退 none')
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, wallpaperOpacity: 0.5, wallpaperBlur: 24 })
const loaded = exports.__internals.loadSettings()
assert.equal(loaded.wallpaperOpacity, 0.5)
assert.equal(loaded.wallpaperBlur, 24)
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS, wallpaperOpacity: 3, wallpaperBlur: 99 })
const clamped = exports.__internals.loadSettings()
assert.equal(clamped.wallpaperOpacity, 1, '不透明度钳位到 1')
assert.equal(clamped.wallpaperBlur, 60, '模糊钳位到 60')
saveSettings({ ...exports.__internals.DEFAULT_SETTINGS })

// 应用层翻转：壁纸开启 → 重建半透明 override 层（同一 source 替换）
const before = overrideCalls.length
applySettings(fakeCtx, { ...exports.__internals.loadSettings(), wallpaper: 'default' })
assert.equal(overrideCalls.length, before + 1, '壁纸状态翻转必须重建 override 层')
assert.ok(
	overrideCalls[before].tokens['--dsw-alias-bg-base'].dark.startsWith('rgba('),
	'翻转后表面半透明',
)
assert.ok(documentStub.body.classList.contains('jarvis-wallpaper'))
assert.ok(created.some((el) => el.id === 'jarvis-wallpaper'), '翻转后壁纸层 div 存在')

// 清理 effect（触发 dispose 闭包，含 wakeEngine.dispose 与壁纸层拆除）
effects[0].disposer()
assert.ok(!created.find((el) => el.id === 'jarvis-wallpaper').parentNode, '清理后壁纸层 div 已拆除')
assert.ok(
	!docListeners.some((l) => l.type === 'keydown'),
	'清理后必须移除打字音效的 keydown 监听',
)

console.log('✔ smoke: module registration, tokens, apply pipeline, wake word engine — all passed')
