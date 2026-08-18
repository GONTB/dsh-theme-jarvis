// dsh-theme-jarvis host 半测试：
// 覆盖 /api/dsh-theme-jarvis/transcribe、/api/dsh-theme-jarvis/stt-config
// 与 /api/dsh-theme-jarvis/wallpaper/default 三条路由：multipart 转发形状、
// 四层配置优先级（overlay > env > patch > 默认）、overlay 持久化（写入临时
// DSH_HOME，不触碰真实配置）、内置壁纸静态服务与错误分支。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 内置壁纸路径（与 index.js 同源）
const wallpaperFile = fileURLToPath(new URL('../assets/默认壁纸.png', import.meta.url))

// ── 隔离持久化：临时 DSH_HOME ─────────────────────────────────────────
const tempHome = mkdtempSync(join(tmpdir(), 'dsh-jarvis-test-'))
process.env.DSH_HOME = tempHome
process.env.DSH_JARVIS_STT_KEY = ''
process.env.DSH_JARVIS_STT_BASE_URL = ''
process.env.DSH_JARVIS_STT_MODEL = ''

// ── fetch 桩：捕获 multipart 请求并回传假上游响应 ────────────────────
const upstreamCalls = []
let upstreamBehavior = { ok: true, status: 200, body: JSON.stringify({ text: '你好世界' }) }
globalThis.fetch = async (url, options) => {
	upstreamCalls.push({ url, options })
	return {
		ok: upstreamBehavior.ok,
		status: upstreamBehavior.status,
		text: async () => upstreamBehavior.body,
	}
}

const { apply } = await import('../index.js')

function makeInstance(rawConfig) {
	const routes = []
	const effects = []
	const httpCtx = {
		effect(fn, label) {
			const disposer = fn()
			effects.push({ disposer, label })
		},
		webServer: {
			register(route) {
				routes.push(route)
				return () => {}
			},
		},
	}
	apply(
		{
			inject(services, callback) {
				assert.deepEqual(services, ['webServer'])
				callback(httpCtx)
			},
		},
		rawConfig,
	)
	assert.equal(
		routes.length,
		15,
		'每个实例注册 transcribe + stt-config + local-stt/health + files/list + files/read + files/write + files/create + terminal/open + terminal/read + terminal/write + terminal/close + git/status + git/op + wallpaper + donate/qrcode 十五条路由',
	)
	const byPath = {}
	for (const route of routes) byPath[route.path] = route.handler
	return { byPath, effects }
}

function makeReq({ method = 'POST', body = '', remote = '127.0.0.1' } = {}) {
	return {
		method,
		socket: { remoteAddress: remote },
		async *[Symbol.asyncIterator]() {
			yield body
		},
	}
}

function makeRes() {
	const res = { status: 0, headers: null, body: '' }
	res.writeHead = (status, headers) => {
		res.status = status
		res.headers = headers
	}
	res.end = (chunk) => {
		res.body = chunk || ''
	}
	return res
}

const jsonBody = (obj) => JSON.stringify(obj)

// ── 1. 转写成功路径：multipart 形状与文本透传 ─────────────────────────
{
	const { byPath } = makeInstance({
		stt: { apiKey: 'sk-patch', baseUrl: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/SenseVoiceSmall' },
	})
	const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00])
	const res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](
		makeReq({ body: jsonBody({ audio: wav.toString('base64'), mime: 'audio/wav' }) }),
		res,
	)
	assert.equal(res.status, 200)
	assert.deepEqual(JSON.parse(res.body), { ok: true, text: '你好世界' })
	assert.equal(upstreamCalls.length, 1)
	assert.equal(upstreamCalls[0].url, 'https://api.siliconflow.cn/v1/audio/transcriptions')
	assert.equal(upstreamCalls[0].options.headers.authorization, 'Bearer sk-patch')
	const form = upstreamCalls[0].options.body
	assert.ok(form instanceof FormData, '上游必须是 multipart FormData')
	assert.equal(form.get('model'), 'FunAudioLLM/SenseVoiceSmall')
	assert.equal(form.get('file').type, 'audio/wav')
	assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), wav)
}

// ── 2. 转写错误分支 ───────────────────────────────────────────────────
{
	const { byPath } = makeInstance({ stt: { apiKey: 'sk-patch' } })
	let res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 405)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: jsonBody({ audio: 'AAA' }), remote: '192.168.1.5' }), res)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: 'not-json' }), res)
	assert.equal(res.status, 400)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: jsonBody({}) }), res)
	assert.equal(res.status, 400)
	upstreamBehavior = { ok: false, status: 401, body: 'unauthorized' }
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: jsonBody({ audio: 'AAA' }) }), res)
	assert.equal(res.status, 502)
	assert.ok(JSON.parse(res.body).error.includes('401'))
	upstreamBehavior = { ok: true, status: 200, body: JSON.stringify({ text: '你好世界' }) }
}

// ── 3. 无 Key（无补丁/环境/overlay）→ 503 ─────────────────────────────
{
	const { byPath } = makeInstance({})
	const res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: jsonBody({ audio: 'AAA' }) }), res)
	assert.equal(res.status, 503)
}

// ── 4. stt-config：GET 默认值 / POST 保存 / 持久化 / 空值删除 ─────────
{
	const { byPath } = makeInstance({ stt: { baseUrl: 'https://patch.example.com/v1' } })

	// GET：overlay 为空 → patch 生效
	let res = makeRes()
	await byPath['/api/dsh-theme-jarvis/stt-config'](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 200)
	assert.equal(JSON.parse(res.body).config.baseUrl, 'https://patch.example.com/v1')

	// POST 保存 overlay（apiKey + model）
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/stt-config'](
		makeReq({ body: jsonBody({ apiKey: 'sk-overlay', model: 'paraformer-v2' }) }),
		res,
	)
	assert.equal(res.status, 200)
	assert.equal(JSON.parse(res.body).config.apiKey, 'sk-overlay')
	assert.equal(JSON.parse(res.body).config.model, 'paraformer-v2')
	assert.ok(existsSync(join(tempHome, 'plugins', 'dsh-theme-jarvis', 'stt.json')), 'overlay 必须持久化')
	const stored = JSON.parse(readFileSync(join(tempHome, 'plugins', 'dsh-theme-jarvis', 'stt.json'), 'utf8'))
	assert.equal(stored.apiKey, 'sk-overlay')
	assert.equal(stored.baseUrl, undefined, '未修改的字段不写入 overlay')

	// 新实例（同进程重启模拟）读取持久化值，且转写用 overlay 的 key
	const next = makeInstance({})
	res = makeRes()
	await next.byPath['/api/dsh-theme-jarvis/stt-config'](makeReq({ method: 'GET' }), res)
	assert.equal(JSON.parse(res.body).config.apiKey, 'sk-overlay')
	res = makeRes()
	await next.byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: jsonBody({ audio: 'AAA' }) }), res)
	assert.equal(res.status, 200)
	assert.equal(upstreamCalls[upstreamCalls.length - 1].options.headers.authorization, 'Bearer sk-overlay')

	// 空字符串 = 删除 overlay 字段，回退补丁/默认
	res = makeRes()
	await next.byPath['/api/dsh-theme-jarvis/stt-config'](makeReq({ body: jsonBody({ apiKey: '' }) }), res)
	assert.equal(res.status, 200)
	assert.equal(JSON.parse(res.body).config.apiKey, '', '清空后回退（无 patch/env → 空）')
}

// ── 5. stt-config 守卫与校验 ──────────────────────────────────────────
{
	const { byPath } = makeInstance({})
	let res = makeRes()
	await byPath['/api/dsh-theme-jarvis/stt-config'](makeReq({ method: 'DELETE' }), res)
	assert.equal(res.status, 405)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/stt-config'](makeReq({ remote: '10.0.0.2' }), res)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/stt-config'](makeReq({ body: jsonBody({ apiKey: 123 }) }), res)
	assert.equal(res.status, 400)
}

// ── 6. 环境变量回退 ───────────────────────────────────────────────────
{
	process.env.DSH_JARVIS_STT_KEY = 'sk-env'
	const { byPath } = makeInstance({})
	const res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](makeReq({ body: jsonBody({ audio: 'AAA' }) }), res)
	assert.equal(res.status, 200)
	assert.equal(upstreamCalls[upstreamCalls.length - 1].options.headers.authorization, 'Bearer sk-env')
	process.env.DSH_JARVIS_STT_KEY = ''
}

// ── 7. 内置壁纸静态路由 ───────────────────────────────────────────────
{
	const { byPath } = makeInstance({})
	const expected = readFileSync(wallpaperFile)

	// GET 正常：image/png + 缓存头 + 字节与打包文件一致
	let res = makeRes()
	await byPath['/api/dsh-theme-jarvis/wallpaper/default'](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 200)
	assert.equal(res.headers['content-type'], 'image/png')
	assert.equal(res.headers['content-length'], expected.length)
	assert.ok(String(res.headers['cache-control']).indexOf('max-age=86400') !== -1)
	assert.ok(Buffer.isBuffer(res.body), '壁纸以 Buffer 返回')
	assert.deepEqual(res.body, expected, '壁纸字节必须与 assets/默认壁纸.png 一致')

	// 非回环 → 403；非 GET → 405
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/wallpaper/default'](
		makeReq({ method: 'GET', remote: '192.168.1.9' }),
		res,
	)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/wallpaper/default'](makeReq({ method: 'POST', body: 'x' }), res)
	assert.equal(res.status, 405)
}

// ── 8. 本地离线识别（FunASR）backend ──────────────────────────────────
{
	const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00])

	// 本地转发成功：原始 WAV 直传 localUrl/transcribe，解析 {text}
	upstreamBehavior = { ok: true, status: 200, body: JSON.stringify({ ok: true, text: '你好世界' }) }
	const { byPath } = makeInstance({ stt: { localUrl: 'http://127.0.0.1:8010' } })
	let res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](
		makeReq({ body: jsonBody({ audio: wav.toString('base64'), backend: 'local' }) }),
		res,
	)
	assert.equal(res.status, 200)
	assert.deepEqual(JSON.parse(res.body), { ok: true, text: '你好世界' })
	const localCall = upstreamCalls[upstreamCalls.length - 1]
	assert.equal(localCall.url, 'http://127.0.0.1:8010/transcribe')
	assert.equal(localCall.options.headers['content-type'], 'application/octet-stream')
	assert.ok(Buffer.isBuffer(localCall.options.body), '本地后端必须直传原始 WAV 字节')
	assert.deepEqual(localCall.options.body, wav)

	// 本地地址必须回环：非回环 → 400
	res = makeRes()
	const evil = makeInstance({ stt: { localUrl: 'http://192.168.1.10:8010' } })
	await evil.byPath['/api/dsh-theme-jarvis/transcribe'](
		makeReq({ body: jsonBody({ audio: wav.toString('base64'), backend: 'local' }) }),
		res,
	)
	assert.equal(res.status, 400)

	// 本地服务不可达 → 502
	upstreamBehavior = { ok: false, status: 500, body: 'boom' }
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/transcribe'](
		makeReq({ body: jsonBody({ audio: wav.toString('base64'), backend: 'local' }) }),
		res,
	)
	assert.equal(res.status, 502)
	assert.ok(JSON.parse(res.body).error.includes('本地识别'))
	upstreamBehavior = { ok: true, status: 200, body: JSON.stringify({ ok: true, text: '你好世界' }) }

	// 健康检查代理：GET /api/dsh-theme-jarvis/local-stt/health → localUrl/health
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/local-stt/health'](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 200)
	assert.deepEqual(JSON.parse(res.body), { ok: true, initialized: false })
	assert.equal(upstreamCalls[upstreamCalls.length - 1].url, 'http://127.0.0.1:8010/health')
	upstreamBehavior = { ok: true, status: 200, body: JSON.stringify({ initialized: true }) }
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/local-stt/health'](makeReq({ method: 'GET' }), res)
	assert.deepEqual(JSON.parse(res.body), { ok: true, initialized: true })
	upstreamBehavior = { ok: true, status: 200, body: JSON.stringify({ ok: true, text: '你好世界' }) }
}

// ── 9. 工作区文件浏览/编辑路由（files/list + files/read + files/write）──
{
	// 准备临时目录结构：一个子目录 + 一个文本文件 + 一个二进制文件
	const root = join(tempHome, 'workspace-demo')
	mkdirSync(join(root, 'sub'), { recursive: true })
	writeFileSync(join(root, 'hello.txt'), '你好，贾维斯')
	const binaryBuf = Buffer.from([0x00, 0x01, 0x02, 0xff])
	writeFileSync(join(root, 'data.bin'), binaryBuf)

	const { byPath } = makeInstance({})

	// files/list：文件+目录都有 kind 标识，目录排在前面
	let res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/list'](makeReq({ body: jsonBody({ path: root }) }), res)
	assert.equal(res.status, 200)
	const listed = JSON.parse(res.body)
	assert.ok(listed.ok)
	const names = listed.entries.map((e) => e.name).sort()
	assert.deepEqual(names, ['data.bin', 'hello.txt', 'sub'])
	const sub = listed.entries.find((e) => e.name === 'sub')
	const txt = listed.entries.find((e) => e.name === 'hello.txt')
	assert.equal(sub.kind, 'dir')
	assert.equal(txt.kind, 'file')
	assert.ok(txt.size > 0)
	assert.equal(listed.entries[0].kind, 'dir', '目录排在文件前面')

	// files/read：文本文件返回内容；二进制返回 binary 标记
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/read'](makeReq({ body: jsonBody({ path: join(root, 'hello.txt') }) }), res)
	assert.equal(res.status, 200)
	assert.deepEqual(JSON.parse(res.body), {
		ok: true,
		binary: false,
		text: '你好，贾维斯',
		truncated: false,
		size: Buffer.byteLength('你好，贾维斯'),
	})
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/read'](makeReq({ body: jsonBody({ path: join(root, 'data.bin') }) }), res)
	assert.equal(res.status, 200)
	assert.equal(JSON.parse(res.body).binary, true, 'NUL 字节嗅探为二进制')

	// 守卫：相对路径 400 / 目录按文件读 400 / 非回环 403 / 不存在 404
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/list'](makeReq({ body: jsonBody({ path: 'relative/path' }) }), res)
	assert.equal(res.status, 400)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/read'](makeReq({ body: jsonBody({ path: root }) }), res)
	assert.equal(res.status, 400, '目录不能按文件读')
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/list'](makeReq({ body: jsonBody({ path: root }), remote: '10.0.0.8' }), res)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/list'](makeReq({ body: jsonBody({ path: join(root, 'nope') }) }), res)
	assert.equal(res.status, 404)

	// files/write：覆盖已有文本文件，随后 files/read 能读到新内容
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/write'](
		makeReq({ body: jsonBody({ path: join(root, 'hello.txt'), text: '已编辑：贾维斯修改' }) }),
		res,
	)
	assert.equal(res.status, 200)
	assert.deepEqual(JSON.parse(res.body), { ok: true })
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/read'](makeReq({ body: jsonBody({ path: join(root, 'hello.txt') }) }), res)
	assert.equal(res.status, 200)
	assert.equal(JSON.parse(res.body).text, '已编辑：贾维斯修改', '写入的内容必须能被读回')

	// files/write 守卫：写目录 400 / 相对路径 400 / text 非字符串 400 / 非回环 403 / 不存在 500
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/write'](makeReq({ body: jsonBody({ path: root, text: 'x' }) }), res)
	assert.equal(res.status, 400, '不能写目录')
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/write'](makeReq({ body: jsonBody({ path: 'relative/path.txt', text: 'x' }) }), res)
	assert.equal(res.status, 400)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/write'](makeReq({ body: jsonBody({ path: join(root, 'hello.txt'), text: 42 }) }), res)
	assert.equal(res.status, 400, 'text 必须是字符串')
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/write'](
		makeReq({ body: jsonBody({ path: join(root, 'hello.txt'), text: 'x' }), remote: '10.0.0.8' }),
		res,
	)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath['/api/dsh-theme-jarvis/files/write'](makeReq({ body: jsonBody({ path: join(root, 'missing.txt'), text: 'x' }) }), res)
	assert.equal(res.status, 500, '不存在的文件不可写')
}

// ── 10. Git 状态 / 操作路由（git/status + git/op）────────────────────
{
	const gitProbe = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
	const hasGit = !gitProbe.error && gitProbe.status === 0
	const { byPath } = makeInstance({})
	const route = '/api/dsh-theme-jarvis/git/status'

	// 守卫：GET 405 / 非回环 403 / 相对路径 400 / 不存在 404 / 文件 400
	let res = makeRes()
	await byPath[route](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 405)
	res = makeRes()
	await byPath[route](makeReq({ body: jsonBody({ path: tempHome }), remote: '10.0.0.8' }), res)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath[route](makeReq({ body: jsonBody({ path: 'relative' }) }), res)
	assert.equal(res.status, 400)
	res = makeRes()
	await byPath[route](makeReq({ body: jsonBody({ path: join(tempHome, 'nope') }) }), res)
	assert.equal(res.status, 404)
	res = makeRes()
	await byPath[route](makeReq({ body: jsonBody({ path: join(tempHome, 'workspace-demo', 'hello.txt') }) }), res)
	assert.equal(res.status, 400, '文件路径不能查 git 状态')

	// 非 git 目录 → git:false（不报错，客户端不显示状态）
	res = makeRes()
	await byPath[route](makeReq({ body: jsonBody({ path: tempHome }) }), res)
	assert.equal(res.status, 200)
	assert.equal(JSON.parse(res.body).git, false, '非 git 仓库返回 git:false')

	if (!hasGit) {
		console.log('  (git 不可用，跳过真实仓库状态断言)')
	} else {
		const repo = join(tempHome, 'git-repo')
		mkdirSync(join(repo, 'sub'), { recursive: true })
		writeFileSync(join(repo, 'a.txt'), 'hello')
		writeFileSync(join(repo, 'sub', 'b.txt'), 'bbb')
		const g = (args) =>
			spawnSync('git', ['-c', 'core.autocrlf=false', '-C', repo, ...args], {
				encoding: 'utf8',
				timeout: 10000,
				windowsHide: true,
			})
		assert.equal(g(['init']).status, 0, 'git init')
		assert.equal(g(['add', '-A']).status, 0, 'git add')
		assert.equal(
			g(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'init']).status,
			0,
			'git commit',
		)

		// 重命名 → renamed（目标路径）；修改新路径（RM）仍为 renamed
		assert.equal(g(['mv', 'a.txt', 'renamed.txt']).status, 0, 'git mv')
		res = makeRes()
		await byPath[route](makeReq({ body: jsonBody({ path: repo }) }), res)
		assert.equal(res.status, 200)
		assert.equal(JSON.parse(res.body).statuses['renamed.txt'], 'renamed', '重命名 → renamed')
		writeFileSync(join(repo, 'renamed.txt'), 'hello-changed')
		res = makeRes()
		await byPath[route](makeReq({ body: jsonBody({ path: repo }) }), res)
		assert.equal(JSON.parse(res.body).statuses['renamed.txt'], 'renamed', 'RM 重命名优先')

		// 暂存新增 → added；未跟踪 → untracked；未改动文件无条目
		writeFileSync(join(repo, 'c.txt'), 'ccc')
		assert.equal(g(['add', 'c.txt']).status, 0)
		writeFileSync(join(repo, 'd.txt'), 'ddd')
		res = makeRes()
		await byPath[route](makeReq({ body: jsonBody({ path: repo }) }), res)
		const st = JSON.parse(res.body).statuses
		assert.equal(st['c.txt'], 'added', '已暂存新文件 → added')
		assert.equal(st['d.txt'], 'untracked', '未跟踪文件 → untracked')
		assert.equal(st['sub/b.txt'], undefined, '未改动文件无状态条目')

		// 增删行数（numstat 合并工作区+暂存）：新暂存 3 行文件 → +3 -0
		writeFileSync(join(repo, 'stat.txt'), 'l1\nl2\nl3\n')
		assert.equal(g(['add', 'stat.txt']).status, 0)
		res = makeRes()
		await byPath[route](makeReq({ body: jsonBody({ path: repo }) }), res)
		const stBody = JSON.parse(res.body)
		assert.equal(stBody.diffs['stat.txt'].additions, 3, '新增文件增行数')
		assert.equal(stBody.diffs['stat.txt'].deletions, 0, '新增文件删行数 0')
		assert.equal(stBody.diffs['d.txt'], undefined, '未跟踪文件不在 numstat 中')

		// git/op：提交（add -A + commit）→ 之后工作区干净
		const opRoute = '/api/dsh-theme-jarvis/git/op'
		res = makeRes()
		await byPath[opRoute](
			makeReq({ body: jsonBody({ op: 'commit', path: repo, message: 'test commit' }) }),
			res,
		)
		assert.equal(res.status, 200)
		assert.equal(JSON.parse(res.body).ok, true, '提交成功')
		res = makeRes()
		await byPath[route](makeReq({ body: jsonBody({ path: repo }) }), res)
		const clean = JSON.parse(res.body)
		assert.equal(Object.keys(clean.statuses).length, 0, '提交后无变更')
		assert.equal(Object.keys(clean.diffs).length, 0, '提交后无 diff')

		// git/op 守卫与错误分支
		res = makeRes()
		await byPath[opRoute](makeReq({ method: 'GET' }), res)
		assert.equal(res.status, 405)
		res = makeRes()
		await byPath[opRoute](
			makeReq({ body: jsonBody({ op: 'commit', path: repo, message: 'x' }), remote: '10.0.0.8' }),
			res,
		)
		assert.equal(res.status, 403)
		res = makeRes()
		await byPath[opRoute](makeReq({ body: jsonBody({ op: 'commit', path: 'relative', message: 'x' }) }), res)
		assert.equal(res.status, 400)
		res = makeRes()
		await byPath[opRoute](makeReq({ body: jsonBody({ op: 'bad', path: repo }) }), res)
		assert.equal(res.status, 400, '非法 op')
		res = makeRes()
		await byPath[opRoute](makeReq({ body: jsonBody({ op: 'commit', path: repo, message: '   ' }) }), res)
		assert.equal(res.status, 400, '空提交信息')
		// 无远程 → push/pull 报错（ok:false + 可读错误）
		res = makeRes()
		await byPath[opRoute](makeReq({ body: jsonBody({ op: 'push', path: repo }) }), res)
		assert.equal(JSON.parse(res.body).ok, false, '无远程 push 失败')
		assert.ok(/push|destination|upstream/i.test(JSON.parse(res.body).error), 'push 错误信息可读')
		res = makeRes()
		await byPath[opRoute](makeReq({ body: jsonBody({ op: 'pull', path: repo }) }), res)
		assert.equal(JSON.parse(res.body).ok, false, '无远程 pull 失败')
		// 非 git 目录 commit → 失败
		res = makeRes()
		await byPath[opRoute](makeReq({ body: jsonBody({ op: 'commit', path: tempHome, message: 'x' }) }), res)
		assert.equal(JSON.parse(res.body).ok, false, '非仓库提交失败')
	}
}

// ── 11. 新建文件 + 简易终端（files/create + terminal/*）──────────────
{
	const { byPath } = makeInstance({})
	const createRoute = '/api/dsh-theme-jarvis/files/create'
	const ws = join(tempHome, 'workspace-demo')

	// files/create：创建空文件，同名自动加序号
	let res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: ws, name: 'newfile.txt' }) }), res)
	assert.equal(res.status, 200)
	const created = JSON.parse(res.body)
	assert.equal(created.ok, true)
	assert.equal(created.name, 'newfile.txt')
	assert.ok(existsSync(created.path), '文件必须真实创建')
	res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: ws, name: 'newfile.txt' }) }), res)
	assert.equal(JSON.parse(res.body).name, 'newfile-2.txt', '同名自动加序号')
	// 守卫：非法名 / 相对路径 / 不存在目录 / 非目录 / 方法 / 回环
	res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: ws, name: '../evil.txt' }) }), res)
	assert.equal(res.status, 400, '非法文件名拒绝')
	res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: 'relative', name: 'x.txt' }) }), res)
	assert.equal(res.status, 400)
	res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: join(ws, 'nope'), name: 'x.txt' }) }), res)
	assert.equal(res.status, 404)
	res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: join(ws, 'hello.txt'), name: 'x.txt' }) }), res)
	assert.equal(res.status, 400, '文件路径不能建文件')
	res = makeRes()
	await byPath[createRoute](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 405)
	res = makeRes()
	await byPath[createRoute](makeReq({ body: jsonBody({ dir: ws, name: 'x.txt' }), remote: '10.0.0.9' }), res)
	assert.equal(res.status, 403)

	// 简易终端：open → write → read 轮询 → close
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
	const openRoute = '/api/dsh-theme-jarvis/terminal/open'
	const readRoute = '/api/dsh-theme-jarvis/terminal/read'
	const writeRoute = '/api/dsh-theme-jarvis/terminal/write'
	const closeRoute = '/api/dsh-theme-jarvis/terminal/close'
	res = makeRes()
	await byPath[openRoute](makeReq({ body: jsonBody({ kind: 'powershell', cwd: ws }) }), res)
	assert.equal(res.status, 200)
	const term = JSON.parse(res.body)
	assert.equal(term.ok, true)
	assert.ok(term.sessionId, '必须返回会话 id')
	const sid = term.sessionId
	// 先等 UTF-8 握手标记（chcp 65001 生效）——生效前写入的中文会被 GBK 错读吞掉
	let boot = ''
	for (let i = 0; i < 60; i += 1) {
		await sleep(100)
		res = makeRes()
		await byPath[readRoute](makeReq({ body: jsonBody({ sessionId: sid }) }), res)
		assert.equal(res.status, 200)
		boot += JSON.parse(res.body).output
		if (boot.includes('__JARVIS_READY__')) break
	}
	assert.ok(boot.includes('__JARVIS_READY__'), '终端必须输出 UTF-8 就绪标记（' + boot.slice(-80) + '）')
	// READY 后写入命令，轮询应出现回显
	res = makeRes()
	await byPath[writeRoute](makeReq({ body: jsonBody({ sessionId: sid, input: 'echo jarvis-terminal-test\n' }) }), res)
	assert.equal(res.status, 200)
	let found = boot.replace(/__JARVIS_READY__/g, '')
	for (let i = 0; i < 40; i += 1) {
		await sleep(120)
		res = makeRes()
		await byPath[readRoute](makeReq({ body: jsonBody({ sessionId: sid }) }), res)
		assert.equal(res.status, 200)
		const chunk = JSON.parse(res.body)
		found += chunk.output
		if (found.includes('jarvis-terminal-test')) break
	}
	assert.ok(found.includes('jarvis-terminal-test'), '终端必须回显命令输出（' + found.slice(-80) + '）')

	// 中文编码：UTF-8 设置必须让中文回显不乱码（GBK 会被解成乱码）
	res = makeRes()
	await byPath[writeRoute](
		makeReq({ body: jsonBody({ sessionId: sid, input: 'echo 贾维斯中文终端测试\n' }) }),
		res,
	)
	assert.equal(res.status, 200)
	let cn = ''
	for (let i = 0; i < 40; i += 1) {
		await sleep(120)
		res = makeRes()
		await byPath[readRoute](makeReq({ body: jsonBody({ sessionId: sid }) }), res)
		assert.equal(res.status, 200)
		cn += JSON.parse(res.body).output
		if (cn.includes('贾维斯中文终端测试')) break
	}
	assert.ok(
		cn.includes('贾维斯中文终端测试'),
		'终端中文必须无乱码（UTF-8 编码设置生效）: ' + cn.slice(-80),
	)
	res = makeRes()
	await byPath[closeRoute](makeReq({ body: jsonBody({ sessionId: sid }) }), res)
	assert.equal(res.status, 200)
	res = makeRes()
	await byPath[readRoute](makeReq({ body: jsonBody({ sessionId: sid }) }), res)
	assert.equal(res.status, 404, '关闭后会话不存在')
	// 守卫与错误分支
	res = makeRes()
	await byPath[openRoute](makeReq({ body: jsonBody({ kind: 'powershell', cwd: join(ws, 'nope') }) }), res)
	assert.equal(res.status, 404)
	res = makeRes()
	await byPath[openRoute](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 405)
	res = makeRes()
	await byPath[readRoute](makeReq({ body: jsonBody({ sessionId: 'ghost' }) }), res)
	assert.equal(res.status, 404)
	res = makeRes()
	await byPath[writeRoute](makeReq({ body: jsonBody({ sessionId: 'ghost', input: 'x' }) }), res)
	assert.equal(res.status, 404)
	res = makeRes()
	await byPath[openRoute](makeReq({ body: jsonBody({ kind: 'powershell', cwd: ws }), remote: '10.0.0.9' }), res)
	assert.equal(res.status, 403)
}

// ── 12. 支持作者收款码（donate/qrcode 静态服务）──────────────────────
{
	const { byPath } = makeInstance({})
	const qrFile = fileURLToPath(new URL('../assets/支持作者.jpg', import.meta.url))
	const expected = readFileSync(qrFile)
	const route = '/api/dsh-theme-jarvis/donate/qrcode'

	let res = makeRes()
	await byPath[route](makeReq({ method: 'GET' }), res)
	assert.equal(res.status, 200)
	assert.equal(res.headers['content-type'], 'image/jpeg')
	assert.equal(res.headers['content-length'], expected.length)
	assert.ok(Buffer.isBuffer(res.body))
	assert.deepEqual(res.body, expected, '收款码字节必须与 assets/支持作者.jpg 一致')
	res = makeRes()
	await byPath[route](makeReq({ method: 'GET', remote: '192.168.1.9' }), res)
	assert.equal(res.status, 403)
	res = makeRes()
	await byPath[route](makeReq({ method: 'POST', body: 'x' }), res)
	assert.equal(res.status, 405)
}

rmSync(tempHome, { recursive: true, force: true })
console.log('✔ host: transcribe + stt-config + files + terminal + git + wallpaper + donate — all passed')
