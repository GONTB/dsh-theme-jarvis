// 临时诊断：用真实 React renderToString 渲染 JarvisDetailsPanel，找渲染期抛错
import { createRequire } from 'node:module'

const dshReq = createRequire('C:/Users/20949/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/')
const React = dshReq('react')
const { renderToString } = dshReq('react-dom/server')

const captured = { handoff: null, injects: {}, regs: {}, errors: {} }
const docListeners = []
function makeFakeElement() {
	return {
		id: '', tagName: 'div', textContent: '', innerHTML: '', removed: false, style: {},
		children: [], parentNode: null,
		classList: { _set: new Set(), toggle() {}, add() {}, remove() {}, contains() { return false } },
		addEventListener() {}, removeEventListener() {}, appendChild(c) { this.children.push(c); return c },
		prepend(c) { this.children.unshift(c); return c }, contains() { return false },
		removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c },
		remove() { this.removed = true }, querySelector() { return makeFakeElement() },
		hasAttribute() { return false }, setAttribute() {}, setPointerCapture() {},
		getContext() { return new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k in t ? t[k] : () => {}), set(t, k, v) { t[k] = v; return true } }) },
		toDataURL() { return 'data:image/jpeg;base64,AAAA' },
	}
}
const documentStub = {
	hidden: false,
	body: makeFakeElement(),
	head: makeFakeElement(),
	documentElement: makeFakeElement(),
	addEventListener(type, fn, opts) { docListeners.push({ type, fn, opts }) },
	removeEventListener() {},
	createElement(tag) { const el = makeFakeElement(); el.tagName = tag; return el },
	getElementById() { return null },
	querySelector() { return null },
}
globalThis.window = {
	__ModuleLoader__: { load: (h) => { captured.handoff = h } },
	matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
	localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
	requestAnimationFrame: () => 1,
	cancelAnimationFrame: () => {},
}
globalThis.document = documentStub

await import('../client.js')

const exports = captured.handoff.factory((name) => {
	if (name === 'react') return React
	throw new Error('unexpected require: ' + name)
})

const registered = []
const slotCalls = []
const fakeSlots = {
	inject(slot, fn) {
		const rec = { slot, fn }
		slotCalls.push(rec)
		try {
			rec.result = fn()
		} catch (err) {
			rec.error = err
			captured.errors[slot] = err
		}
		return rec
	},
	register(desc, render) {
		registered.push({ desc, render })
		const dispose = () => {}
		dispose.desc = desc
		dispose.render = render
		return dispose
	},
}
const fakeCtx = {
	theme: {
		register: (def) => { registered.push({ theme: def }); return () => {} },
		setTheme() {},
		overrideTokens() { return () => {} },
	},
	on() { return () => {} },
	off() {},
	get(service) {
		if (service === 'slots') return fakeSlots
		if (service === 'layout') return { openDetails() {}, closeDetails() {} }
		return undefined
	},
	effect(fn) { return fn() },
}
exports.apply(fakeCtx, {})

const detailsReg = registered.find((r) => r.desc && r.desc.name === 'details' && r.desc.priority === -1)
if (!detailsReg) {
	console.log('FAIL: details priority -1 条目未注册; slots 错误:', captured.errors)
	process.exit(1)
}
console.log('details 条目已注册 (priority ' + detailsReg.desc.priority + ')')

// 用真实 React 渲染 JarvisDetailsPanel（模拟宿主 props）
// 回归守卫：TDZ（const 前向引用）与任何渲染期抛错都会让 details 座位
// 降级回宿主默认「详情」面板 —— 必须保证 renderToString 不抛错。
try {
	const props = {
		sessionId: 's1',
		useSessions: (sel) => sel({ byId: { s1: { cwd: 'C:\\ws' } } }),
		closeDetails: () => {},
	}
	const html = renderToString(React.createElement(detailsReg.render, props))
	if (!html.includes('jarvis-tree-toolbar') || !html.includes('jarvis-tree-views')) {
		console.log('FAIL: 渲染输出缺少文件侧边栏结构（toolbar/views）')
		process.exit(3)
	}
	console.log('renderToString OK, html length=' + html.length)
} catch (err) {
	console.log('RENDER FAILED:')
	console.log(err && err.stack ? err.stack.split('\n').slice(0, 12).join('\n') : String(err))
	process.exit(2)
}

// 终端组件渲染守卫：渲染期抛错会让终端 tab 崩溃（同 details 降级机制）
try {
	const { JarvisTerminal } = exports.__internals
	const termHtml = renderToString(
		React.createElement(JarvisTerminal, {
			tabId: 'jarvis-term-1',
			record: { kind: 'powershell', cwd: 'C:\\ws', sessionId: null },
			onClose: () => {},
		}),
	)
	if (!termHtml.includes('jarvis-terminal')) {
		console.log('FAIL: 终端组件渲染缺少 jarvis-terminal 结构')
		process.exit(4)
	}
	console.log('terminal render OK')
} catch (err) {
	console.log('TERMINAL RENDER FAILED:')
	console.log(err && err.stack ? err.stack.split('\n').slice(0, 12).join('\n') : String(err))
	process.exit(5)
}
console.log('✔ render: JarvisDetailsPanel + JarvisTerminal 真实 React 渲染无抛错（TDZ 回归守卫）')
process.exit(0)
