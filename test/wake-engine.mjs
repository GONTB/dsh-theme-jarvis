// dsh-theme-jarvis 唤醒引擎仿真测试：
// 用假 SpeechRecognition 跑完整生命周期 —— 开启 → 待命 → 一句话唤醒
// （唤醒词 + 指令）→ 剥离唤醒词 → 静默 1.6s → 经 inputActions.setDraft
// 投递草稿 → 回到待命（新会话）→ 旧会话过期事件被序号守卫忽略 → 关闭。
import assert from 'node:assert/strict'

class FakeSpeechRecognition {
	static instances = []
	constructor() {
		FakeSpeechRecognition.instances.push(this)
		this.lang = ''
		this.continuous = false
		this.interimResults = false
		this.maxAlternatives = 1
		this.onstart = null
		this.onresult = null
		this.onerror = null
		this.onend = null
	}
	start() {
		queueMicrotask(() => {
			if (this.onstart) this.onstart()
		})
	}
	abort() {
		queueMicrotask(() => {
			if (this.onend) this.onend()
		})
	}
	emitResult(results) {
		if (this.onresult) this.onresult({ resultIndex: 0, results })
	}
	// 忠实模拟 Chrome：error 之后总会跟着一次 end
	emitError(error) {
		if (this.onerror) this.onerror({ error })
		queueMicrotask(() => {
			if (this.onend) this.onend()
		})
	}
	emitEnd() {
		if (this.onend) this.onend()
	}
}

function fakeEl() {
	return {
		id: '',
		textContent: '',
		innerHTML: '',
		style: {},
		classList: { add() {}, remove() {}, toggle() {} },
		appendChild() {},
		addEventListener() {},
		removeEventListener() {},
		remove() {},
		querySelector() { return fakeEl() },
	}
}

const created = []
let captured = null
globalThis.window = {
	__ModuleLoader__: { load: (handoff) => { captured = handoff } },
	SpeechRecognition: FakeSpeechRecognition,
	matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
	localStorage: { getItem: () => null, setItem: () => {} },
}
globalThis.document = {
	hidden: false,
	body: fakeEl(),
	head: fakeEl(),
	documentElement: fakeEl(),
	createElement(tag) {
		const el = fakeEl()
		el.tagName = tag
		created.push(el)
		return el
	},
	getElementById(id) {
		return created.find((el) => el.id === id) ?? null
	},
	querySelector() { return null },
	addEventListener() {},
	removeEventListener() {},
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await import('../client.js')
assert.ok(captured, '模块必须注册')
const fakeReact = {
	createElement: (type) => ({ type }),
	useState: (value) => [value, () => {}],
	useEffect: () => {},
	useRef: (value) => ({ current: value }),
}
const mod = captured.factory((name) => {
	if (name === 'react') return fakeReact
	throw new Error('unexpected require: ' + name)
})
const { wakeEngine } = mod.__internals

const drafts = []
wakeEngine.attach({
	inputActions: { setDraft: (text) => drafts.push(text) },
	getDraft: () => '',
})

// ── 1. 开启：创建 zh-CN 连续识别会话 ─────────────────────────────────
wakeEngine.configure({ voice: true, wakeWord: '贾维斯' })
assert.equal(FakeSpeechRecognition.instances.length, 1)
const s0 = FakeSpeechRecognition.instances[0]
assert.equal(s0.lang, 'zh-CN', '中文唤醒词 → zh-CN')
assert.equal(s0.continuous, true)
assert.equal(s0.interimResults, true)
await sleep(10) // 等 onstart microtask
assert.equal(wakeEngine.getState(), 'sleeping')

// ── 2. 一句话唤醒：interim 连续两次出现「贾维斯，帮我写个总结」───────────
s0.emitResult([{ isFinal: false, 0: { transcript: '贾维斯，帮我写个总结' } }])
assert.equal(wakeEngine.getState(), 'sleeping', '单次 interim 命中只计一次（防闪烁误报）')
s0.emitResult([{ isFinal: false, 0: { transcript: '贾维斯，帮我写个总结' } }])
assert.equal(wakeEngine.getState(), 'armed', '连续两次命中后唤醒进入聆听状态')
assert.equal(FakeSpeechRecognition.instances.length, 1, '唤醒不重启会话（同 utterance 自然流入）')

// ── 3. 同 utterance 的 final 到达（仍含唤醒词 → 应剥离）──────────────
s0.emitResult([{ isFinal: true, 0: { transcript: '贾维斯，帮我写个总结' } }])

// ── 4. 静默 1.6s 后投递草稿 ─────────────────────────────────────────
await sleep(1800)
assert.equal(drafts.length, 1, '指令必须写入草稿')
assert.equal(drafts[0], '帮我写个总结', '唤醒词必须被剥离')
assert.equal(wakeEngine.getState(), 'sleeping', '投递后回到待命')

// ── 5. 回到待命会开新会话；旧会话的过期事件被序号守卫忽略 ─────────
assert.equal(FakeSpeechRecognition.instances.length, 2, '复位后应有新会话')
s0.emitEnd() // 过期会话的 onend
s0.emitResult([{ isFinal: true, 0: { transcript: '贾维斯，删掉这个会话' } }]) // 过期 onresult
await sleep(350)
assert.equal(FakeSpeechRecognition.instances.length, 2, '过期事件不得触发新会话')
assert.equal(drafts.length, 1, '过期事件不得投递')

// ── 6. 错误码上报 + 自动重连（Chrome 语义：error 后必跟 end）────────
const s1 = FakeSpeechRecognition.instances[1]
s1.emitError('audio-capture')
assert.equal(wakeEngine.getState(), 'error:audio-capture', '错误状态必须带具体错误码')
await sleep(1600) // audio-capture 退避 1.5s
assert.equal(FakeSpeechRecognition.instances.length, 3, '错误退避后必须自动重连')
await sleep(10)
assert.equal(wakeEngine.getState(), 'sleeping', '重连后回到待命')

// ── 7. auto 模式：连续两次 network 失败自动降级云端 ──────────────────
const s2 = FakeSpeechRecognition.instances[2]
s2.emitError('network')
assert.equal(wakeEngine.getState(), 'error:network', '第一次 network 报具体错误码')
assert.equal(wakeEngine.getBackend(), 'auto', '第一次失败不降级')

wakeEngine.start() // 手工重启（跳过 8s 退避）
const s3 = FakeSpeechRecognition.instances[3]
s3.emitError('network')
assert.equal(wakeEngine.getBackend(), 'cloud', '第二次 network 失败必须降级云端')
assert.equal(wakeEngine.getState(), 'cloud-ready', '降级后进入云端录音就绪')
await sleep(350)
assert.equal(FakeSpeechRecognition.instances.length, 4, '云端模式下不得再开识别会话')

// ── 8. 推挽式后端（cloud/local）开启后必须可直接录音 ─────────────────
wakeEngine.configure({ voice: true, wakeWord: '贾维斯', sttBackend: 'local' })
assert.equal(wakeEngine.getBackend(), 'local')
assert.equal(wakeEngine.getState(), 'local-ready', '本地后端开启后显示录音就绪')
assert.equal(wakeEngine.isActive(), true, '推挽式后端开启后 enabled 必须为 true（否则录音按钮点了没反应）')
wakeEngine.configure({ voice: true, wakeWord: '贾维斯', sttBackend: 'cloud' })
assert.equal(wakeEngine.getState(), 'cloud-ready', '切回云端后状态跟随')
assert.equal(wakeEngine.isActive(), true)
wakeEngine.configure({ voice: true, wakeWord: '贾维斯', sttBackend: 'auto' })
assert.equal(wakeEngine.isActive(), true, 'web/auto 后端走 start() 同样可用')

// ── 9. 关闭与清理 ───────────────────────────────────────────────────
wakeEngine.suspend()
assert.equal(wakeEngine.getState(), 'off')
wakeEngine.dispose()

console.log('✔ wake-engine: 开启 → 唤醒 → 剥离 → 静默投递 → 复位 → 过期守卫 — all passed')
