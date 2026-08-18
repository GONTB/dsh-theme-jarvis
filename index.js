/**
 * dsh-theme-jarvis — host half.
 *
 * 职责一：STT 转发 + 配置管理。
 *   - POST /api/dsh-theme-jarvis/transcribe —— 把浏览器录好的 16k WAV 转发给
 *     云端（OpenAI 兼容端点，默认 SiliconFlow 免费 SenseVoice）或本地离线
 *     服务（复用 vocotype-cli 的 FunASR 引擎，见 local-stt/server.py）。
 *   - GET/POST /api/dsh-theme-jarvis/stt-config —— 设置面板直接读写
 *     apiKey / baseUrl / model / localUrl，持久化在
 *     $DSH_HOME/plugins/dsh-theme-jarvis/stt.json（原子写入）。
 *   - GET /api/dsh-theme-jarvis/local-stt/health —— 代理本地服务健康检查
 *     （浏览器直连本地服务会被 CORS 挡住，经 host 转发）。
 *   优先级：设置面板保存值 > 环境变量 > profile 补丁层 > 内置默认。
 *   仅接受回环地址请求；API Key 只在 host 侧使用，除回显设置面板外不外泄。
 *
 * 职责二：内置默认壁纸静态服务。
 *   - GET /api/dsh-theme-jarvis/wallpaper/default —— 返回打包在
 *     assets/默认壁纸.png 的系统默认壁纸（image/png，仅回环地址）。
 *
 * 职责三：工作区文件浏览 / 编辑 + Git 状态。
 *   - POST /api/dsh-theme-jarvis/files/list|read|write —— 目录浏览、
 *     文本读取与保存（回环限定、绝对路径校验、2MB 上限）。
 *   - POST /api/dsh-theme-jarvis/git/status —— 对目录跑
 *     `git status --porcelain=v1 -z --untracked-files=all`，解析成
 *     相对路径 → 状态（modified/added/deleted/renamed/copied/untracked），
 *     供右侧栏文件树显示 orca 风格状态标签；非 git 仓库 / 无 git 时
 *     返回 git:false（不报错，客户端不显示状态）。
 *
 * 职责四：让本行在 host Loader 中正常挂载 —— client-modules 扫描到
 * dsh.client 声明后，把 /plugins/dsh-theme-jarvis/client.js 送入浏览器
 * 模块图；主题 token、特效、语音唤醒与录音 UI 全部在浏览器端完成。
 *
 * 环境变量：DSH_JARVIS_STT_KEY / DSH_JARVIS_STT_BASE_URL / DSH_JARVIS_STT_MODEL
 *           / DSH_JARVIS_STT_LOCAL_URL
 *
 * 参考实现：
 * - https://github.com/Hjay1101/dsh-plugin-voice-input （host STT 转发）
 * - https://github.com/Tommy00748/dsh-theme-cyberpunk2077 （同构 host 空壳）
 * - https://github.com/BeiZi6/dsh-theme-plugin （webServer 惰性注入接缝）
 * - https://github.com/233stone/vocotype-cli （本地 FunASR 离线识别引擎）
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'jarvis-theme'

/** 打包在包内的系统默认壁纸 */
const WALLPAPER_PATH = fileURLToPath(new URL('./assets/默认壁纸.png', import.meta.url))

/** 打包在包内的支持作者收款码（JARVIS 控制台底部展示） */
const DONATE_QR_PATH = fileURLToPath(new URL('./assets/支持作者.jpg', import.meta.url))

/** 文件浏览路由的护栏 */
const FILES_MAX_ENTRIES = 500 // 单级目录最多返回条目
const FILES_MAX_READ_BYTES = 2 * 1024 * 1024 // 读取文件上限（超大文件拒绝）
const FILES_TEXT_LIMIT = 256 * 1024 // 文本预览上限（超出截断并标记）

// ── 简易终端会话（host 端 spawn 进程 + 增量缓冲轮询）────────────────
const terminalSessions = new Map() // sessionId -> { proc, buffer, lastRead, kind }
let terminalSeq = 0
const TERMINAL_MAX_BUFFER = 256 * 1024 // 单个会话输出缓冲上限
const TERMINAL_IDLE_MS = 15 * 60 * 1000 // 15 分钟无读取自动关闭

/** 探测 Git Bash（git 终端）；找不到回退 PowerShell。 */
function resolveGitShell() {
	const candidates = [
		'C:\\Program Files\\Git\\bin\\bash.exe',
		'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
		'C:\\Program Files\\Git\\git-bash.exe',
	]
	for (const c of candidates) if (existsSync(c)) return c
	return null
}

function openTerminalSession(kind, cwd) {
	const id = 'term-' + ++terminalSeq
	let cmd = 'powershell.exe'
	let args = ['-NoLogo', '-NoExit', '-Command', '-']
	if (kind === 'git') {
		const gitBash = resolveGitShell()
		if (gitBash) {
			cmd = gitBash
			args = ['--login', '-i']
		}
	}
	const proc = spawn(cmd, args, {
		cwd,
		windowsHide: true,
		env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
		stdio: ['pipe', 'pipe', 'pipe'],
	})
	// Windows PowerShell 对管道 stdin/stdout 的编码不稳定（GBK 代码页 /
	// chcp 65001 生效时序），中文会乱码。处理：
	// 1) 第一条命令（纯 ASCII）强制 UTF-8 输出编码 + 代码页 65001，并输出
	//    __JARVIS_READY__ 握手标记（chcp 生效前写入 stdin 的中文会被错读吞掉，
	//    客户端必须等 READY 才允许输入）。
	// 2) 所有含非 ASCII 的输入由 host 用 base64 包装成纯 ASCII 命令执行，
	//    stdin 永远只写 ASCII —— 彻底绕开 5.1 管道输入编码问题。
	// 3) READY 后 host 自动发一条 base64 探测命令，用 UTF-8 / GBK 双解码
	//    确定会话输出编码（哪个解出探测串用哪个），中文输出不再乱码。
	if (kind !== 'git') {
		proc.stdin.write(
			"chcp 65001 | Out-Null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Write-Output '__JARVIS_READY__';\n",
		)
	}
	const session = { proc, buffer: Buffer.alloc(0), encoding: kind === 'git' ? 'utf8' : null, probeSent: false, lastRead: Date.now(), kind }
	proc.stdout.on('data', (d) => {
		const b = Buffer.isBuffer(d) ? d : Buffer.from(String(d))
		session.buffer = Buffer.concat([session.buffer, b])
		if (session.buffer.length > TERMINAL_MAX_BUFFER) session.buffer = session.buffer.subarray(-TERMINAL_MAX_BUFFER)
	})
	proc.stderr.on('data', (d) => {
		const b = Buffer.isBuffer(d) ? d : Buffer.from(String(d))
		session.buffer = Buffer.concat([session.buffer, b])
		if (session.buffer.length > TERMINAL_MAX_BUFFER) session.buffer = session.buffer.subarray(-TERMINAL_MAX_BUFFER)
	})
	terminalSessions.set(id, session)
	return id
}

/** 终端输出编码探测串：哪个解码能解出它，会话就用那个编码。 */
const TERMINAL_PROBE_TEXT = '编码探测中文'
const terminalGbkDecoder = new TextDecoder('gbk')
/** 按会话编码解码输出缓冲（首次调用时探测确定编码），并剥离探测串。 */
function decodeTerminalBuffer(session, buf) {
	if (session.encoding === null) {
		const utf8 = buf.toString('utf8')
		const gbk = terminalGbkDecoder.decode(buf)
		session.encoding = utf8.includes(TERMINAL_PROBE_TEXT) ? 'utf8' : gbk.includes(TERMINAL_PROBE_TEXT) ? 'gbk' : 'utf8'
	}
	let text = session.encoding === 'gbk' ? terminalGbkDecoder.decode(buf) : buf.toString('utf8')
	return text.split(TERMINAL_PROBE_TEXT).join('')
}

function reapIdleTerminals() {
	const now = Date.now()
	for (const [id, s] of terminalSessions) {
		if (now - s.lastRead > TERMINAL_IDLE_MS || s.proc.exitCode !== null) {
			try {
				s.proc.kill()
			} catch {
				/* 已退出 */
			}
			terminalSessions.delete(id)
		}
	}
}

const DEFAULT_STT = {
	apiKey: '',
	baseUrl: 'https://api.siliconflow.cn/v1',
	model: 'FunAudioLLM/SenseVoiceSmall',
	localUrl: 'http://127.0.0.1:8010',
}

/** 设置面板保存值的持久化文件（DSH 数据目录，与 settings.yaml 同源） */
function overlayPath() {
	const home = process.env.DSH_HOME || join(homedir(), '.dsh')
	return join(home, 'plugins', 'dsh-theme-jarvis', 'stt.json')
}

function readOverlay() {
	try {
		if (!existsSync(overlayPath())) return {}
		const parsed = JSON.parse(readFileSync(overlayPath(), 'utf8'))
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch (err) {
		console.warn('[dsh-theme-jarvis] stt overlay read failed:', err)
		return {}
	}
}

function writeOverlay(next) {
	const file = overlayPath()
	try {
		mkdirSync(dirname(file), { recursive: true })
		const tmp = file + '.tmp'
		writeFileSync(tmp, JSON.stringify(next, null, 2))
		renameSync(tmp, file)
		return true
	} catch (err) {
		console.error('[dsh-theme-jarvis] stt overlay write failed:', err)
		return false
	}
}

const firstNonEmpty = (...values) => {
	for (const value of values) {
		if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
	}
	return ''
}

/**
 * 合并四层配置：设置面板 overlay > 环境变量 > 补丁层 > 内置默认。
 * @param patch - 补丁层 stt 配置（cordis.patch.yml）
 * @param overlay - 设置面板持久化的用户值
 */
function buildSttConfig(patch, overlay) {
	const p = patch && typeof patch === 'object' ? patch : {}
	const o = overlay && typeof overlay === 'object' ? overlay : {}
	const env = process.env
	return {
		apiKey: firstNonEmpty(o.apiKey, env.DSH_JARVIS_STT_KEY, p.apiKey, DEFAULT_STT.apiKey),
		baseUrl: firstNonEmpty(o.baseUrl, env.DSH_JARVIS_STT_BASE_URL, p.baseUrl, DEFAULT_STT.baseUrl).replace(/\/+$/, ''),
		model: firstNonEmpty(o.model, env.DSH_JARVIS_STT_MODEL, p.model, DEFAULT_STT.model),
		localUrl: firstNonEmpty(o.localUrl, env.DSH_JARVIS_STT_LOCAL_URL, p.localUrl, DEFAULT_STT.localUrl).replace(/\/+$/, ''),
	}
}

const isLoopback = (address) =>
	address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'

/** 本地服务地址必须指向回环（防止被利用向任意内网地址发起请求）。 */
function isLocalUrl(value) {
	try {
		const u = new URL(value)
		const host = u.hostname.toLowerCase()
		return (
			(u.protocol === 'http:' || u.protocol === 'https:') &&
			(host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '::ffff:127.0.0.1')
		)
	} catch {
		return false
	}
}

function sendJson(res, status, payload) {
	const body = JSON.stringify(payload)
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(body),
		'cache-control': 'no-store',
	})
	res.end(body)
}

const MAX_BODY_BYTES = 4 * 1024 * 1024 // 20s 16k WAV 约 640KB，4MB 上限足够
const FIELD_CAPS = { apiKey: 200, baseUrl: 300, model: 100, localUrl: 200 }

async function readJsonBody(req) {
	let body = ''
	try {
		for await (const chunk of req) {
			body += chunk
			if (body.length > MAX_BODY_BYTES) return { error: 'body too large' }
		}
	} catch {
		return { error: 'bad request body' }
	}
	try {
		return { value: JSON.parse(body) }
	} catch {
		return { error: 'invalid json' }
	}
}

// ── Git status 解析（porcelain=v1 + -z，路径不转义、NUL 分隔）────────
// 映射与 orca status-display.ts 一致：modified/added/deleted/renamed/
// copied/untracked；冲突（U）归为 modified。
// 注意 -z 模式下重命名/复制是 'XY NEW_PATH\0OLD_PATH\0'：新路径在带
// XY 前缀的首个 token 里，旧路径是下一个裸 token（无前缀），需跳过。
function porcelainStatus(x, y) {
	if (x === 'R' || y === 'R') return 'renamed'
	if (x === 'C' || y === 'C') return 'copied'
	if (x === 'A' || y === 'A') return 'added'
	if (x === 'D' || y === 'D') return 'deleted'
	if (x === 'M' || y === 'M' || x === 'T' || y === 'T') return 'modified'
	if (x === '?' && y === '?') return 'untracked'
	if (x === 'U' || y === 'U') return 'modified' // 冲突视为修改
	return null
}

function parseGitPorcelain(stdout) {
	const statuses = {}
	const tokens = String(stdout || '').split('\0')
	let i = 0
	while (i < tokens.length) {
		const token = tokens[i]
		if (!token) {
			i += 1
			continue
		}
		const x = token[0]
		const y = token[1]
		const status = porcelainStatus(x, y)
		const path = token.slice(3) // "XY " 后是路径
		if (x === 'R' || x === 'C') {
			// 重命名/复制：新路径在首个 token，下一 token 是旧路径，跳过
			if (status && path) statuses[path] = status
			i += 2
			continue
		}
		if (status && path) statuses[path] = status
		i += 1
	}
	return statuses
}

/** numstat -z 解析：每条记录 `added\tdeleted\tpath`（NUL 分隔），
 *  合并工作区 + 暂存区的增删行数；二进制（-）跳过。 */
function parseGitNumstat(stdout) {
	const diffs = {}
	const tokens = String(stdout || '').split('\0')
	for (const token of tokens) {
		if (!token) continue
		const tab1 = token.indexOf('\t')
		if (tab1 < 0) continue
		const tab2 = token.indexOf('\t', tab1 + 1)
		if (tab2 < 0) continue
		const added = token.slice(0, tab1)
		const deleted = token.slice(tab1 + 1, tab2)
		const path = token.slice(tab2 + 1)
		if (!path || added === '-' || deleted === '-') continue // 二进制
		const a = parseInt(added, 10) || 0
		const d = parseInt(deleted, 10) || 0
		const prev = diffs[path]
		diffs[path] = prev
			? { additions: prev.additions + a, deletions: prev.deletions + d }
			: { additions: a, deletions: d }
	}
	return diffs
}

const GIT_STATUS_TIMEOUT_MS = 6000
const GIT_STATUS_MAX_BUFFER = 8 * 1024 * 1024
const GIT_OP_TIMEOUT_MS = 90000 // push/pull 可能较慢

export function apply(ctx, rawConfig) {
	// 惰性注入：没有 webServer 的组合（如 headless）本行照常挂载，只跳过路由
	ctx.inject(['webServer'], (httpCtx) => {
		httpCtx.effect(
			() => {
				const patch = rawConfig && typeof rawConfig === 'object' ? rawConfig.stt : undefined
				const stt = () => buildSttConfig(patch, readOverlay())
				const guard = (req) => isLoopback(req.socket && req.socket.remoteAddress)

				// ── 转写端点 ───────────────────────────────────────────
				const disposeTranscribe = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/transcribe',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const payload = parsed.value
						if (!payload || typeof payload.audio !== 'string' || !payload.audio) {
							sendJson(res, 400, { ok: false, error: 'missing audio' })
							return
						}
						let audio
						try {
							audio = Buffer.from(payload.audio, 'base64')
						} catch {
							sendJson(res, 400, { ok: false, error: 'invalid base64' })
							return
						}
						if (audio.length === 0 || audio.length > MAX_BODY_BYTES) {
							sendJson(res, 413, { ok: false, error: 'audio too large' })
							return
						}
						// backend: cloud（默认）| local —— 本地离线（FunASR）走原始 WAV 直传
						const cfg = stt()
						const backend = payload.backend === 'local' ? 'local' : 'cloud'

						if (backend === 'local') {
							if (!cfg.localUrl) {
								sendJson(res, 503, {
									ok: false,
									error: '本地识别服务地址未配置：请在设置 → JARVIS 控制台 → 本地识别配置 里填写并保存，或设置环境变量 DSH_JARVIS_STT_LOCAL_URL',
								})
								return
							}
							if (!isLocalUrl(cfg.localUrl)) {
								sendJson(res, 400, { ok: false, error: '本地识别服务地址必须指向回环地址（127.0.0.1 / localhost）' })
								return
							}
							try {
								const upstream = await fetch(cfg.localUrl + '/transcribe', {
									method: 'POST',
									headers: { 'content-type': 'application/octet-stream' },
									body: audio,
									signal: AbortSignal.timeout(60000),
								})
								const upstreamBody = await upstream.text().catch(() => '')
								if (!upstream.ok) {
									sendJson(res, 502, {
										ok: false,
										error: '本地识别错误 ' + upstream.status + ': ' + upstreamBody.slice(0, 300),
									})
									return
								}
								let data = null
								try {
									data = JSON.parse(upstreamBody)
								} catch {
									data = null
								}
								const text = data && typeof data.text === 'string' ? data.text : ''
								if (!text) {
									sendJson(res, 502, { ok: false, error: '本地识别未返回文本' })
									return
								}
								sendJson(res, 200, { ok: true, text })
							} catch (err) {
								sendJson(res, 502, {
									ok: false,
									error: '本地识别请求失败（请确认本地服务已启动）: ' + (err && err.message ? err.message : String(err)),
								})
							}
							return
						}

						// ── 云端路径（OpenAI 兼容端点）────────────────────
						if (!cfg.apiKey) {
							sendJson(res, 503, {
								ok: false,
								error: 'STT API key 未配置：请在设置 → JARVIS 控制台 → 云端识别配置 里填写，或设置环境变量 DSH_JARVIS_STT_KEY',
							})
							return
						}
						try {
							const form = new FormData()
							form.append('model', cfg.model)
							form.append('file', new Blob([audio], { type: 'audio/wav' }), 'recording.wav')
							const upstream = await fetch(cfg.baseUrl + '/audio/transcriptions', {
								method: 'POST',
								headers: { authorization: 'Bearer ' + cfg.apiKey },
								body: form,
								signal: AbortSignal.timeout(30000),
							})
							const upstreamBody = await upstream.text().catch(() => '')
							if (!upstream.ok) {
								sendJson(res, 502, {
									ok: false,
									error: 'STT 上游错误 ' + upstream.status + ': ' + upstreamBody.slice(0, 300),
								})
								return
							}
							let data = null
							try {
								data = JSON.parse(upstreamBody)
							} catch {
								data = null
							}
							const text =
								data && typeof data.text === 'string'
									? data.text
									: data && data.output && typeof data.output.text === 'string'
										? data.output.text
										: ''
							if (!text) {
								sendJson(res, 502, { ok: false, error: 'STT 上游未返回文本' })
								return
							}
							sendJson(res, 200, { ok: true, text })
						} catch (err) {
							sendJson(res, 502, {
								ok: false,
								error: 'STT 请求失败: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})

				// ── 配置端点（设置面板读写）─────────────────────────────
				const disposeConfig = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/stt-config',
					handler: async (req, res) => {
						if (req.method !== 'GET' && req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						if (req.method === 'GET') {
							sendJson(res, 200, { ok: true, config: stt() })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const patchBody = parsed.value
						if (!patchBody || typeof patchBody !== 'object') {
							sendJson(res, 400, { ok: false, error: 'invalid body' })
							return
						}
						const overlay = readOverlay()
						for (const field of ['apiKey', 'baseUrl', 'model', 'localUrl']) {
							const value = patchBody[field]
							if (value === undefined || value === null) continue
							if (typeof value !== 'string') {
								sendJson(res, 400, { ok: false, error: field + ' must be a string' })
								return
							}
							const capped = value.trim().slice(0, FIELD_CAPS[field])
							if (capped === '') delete overlay[field]
							else overlay[field] = capped
						}
						if (!writeOverlay(overlay)) {
							sendJson(res, 500, { ok: false, error: 'persist failed' })
							return
						}
						sendJson(res, 200, { ok: true, config: buildSttConfig(patch, overlay) })
					},
				})

				// ── 工作区文件浏览（JARVIS 文件视图）─────────────────────
				// 官方 host.listDirectory 的 browse 能力只列子目录（目录选择器
				// 语义），这里提供完整文件浏览：list 含文件+目录，read 提供
				// 文本预览。仅回环地址；路径必须绝对；读取有大小护栏。
				const resolveAbs = (value) => {
					const raw = typeof value === 'string' ? value.trim() : ''
					// 显式相对路径直接拒绝（resolve 会把它们变成绝对路径）
					if (raw && !isAbsolute(raw)) return null
					const target = raw ? resolve(raw) : homedir()
					return isAbsolute(target) ? target : null
				}
				const disposeFilesList = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/files/list',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const target = resolveAbs(parsed.value && parsed.value.path)
						if (target === null) {
							sendJson(res, 400, { ok: false, error: 'path must be absolute' })
							return
						}
						try {
							const names = readdirSync(target)
							const entries = []
							for (const name of names) {
								const full = join(target, name)
								let kind = 'file'
								let size = 0
								try {
									const st = statSync(full)
									if (st.isDirectory()) kind = 'dir'
									size = st.size
								} catch {
									continue // 读取失败的条目跳过
								}
								entries.push({ name, path: full, kind, size, hidden: name.startsWith('.') })
							}
							entries.sort((a, b) =>
								a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
							)
							const truncated = entries.length > FILES_MAX_ENTRIES
							sendJson(res, 200, {
								ok: true,
								path: target,
								entries: truncated ? entries.slice(0, FILES_MAX_ENTRIES) : entries,
								truncated,
							})
						} catch (err) {
							sendJson(res, 404, {
								ok: false,
								error: '无法列出目录: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})
				const disposeFilesRead = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/files/read',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const target = resolveAbs(parsed.value && parsed.value.path)
						if (target === null) {
							sendJson(res, 400, { ok: false, error: 'path must be absolute' })
							return
						}
						try {
							const st = statSync(target)
							if (!st.isFile()) {
								sendJson(res, 400, { ok: false, error: 'not a regular file' })
								return
							}
							if (st.size > FILES_MAX_READ_BYTES) {
								sendJson(res, 413, { ok: false, error: '文件超过 2MB，请用系统编辑器打开' })
								return
							}
							const buf = readFileSync(target)
							// 二进制嗅探：前 8KB 含 NUL 字节即视为二进制
							const probe = buf.subarray(0, Math.min(8192, buf.length))
							const binary = probe.includes(0)
							if (binary) {
								sendJson(res, 200, { ok: true, binary: true, size: st.size })
								return
							}
							const truncated = buf.length > FILES_TEXT_LIMIT
							const text = buf.subarray(0, FILES_TEXT_LIMIT).toString('utf8')
							sendJson(res, 200, { ok: true, binary: false, text, truncated, size: st.size })
						} catch (err) {
							sendJson(res, 404, {
								ok: false,
								error: '无法读取文件: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})
				const disposeFilesWrite = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/files/write',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const body = parsed.value
						const target = resolveAbs(body && body.path)
						if (target === null) {
							sendJson(res, 400, { ok: false, error: 'path must be absolute' })
							return
						}
						if (typeof body.text !== 'string') {
							sendJson(res, 400, { ok: false, error: 'text must be a string' })
							return
						}
						if (Buffer.byteLength(body.text, 'utf8') > FILES_MAX_READ_BYTES) {
							sendJson(res, 413, { ok: false, error: '内容超过 2MB' })
							return
						}
						try {
							const st = statSync(target)
							if (!st.isFile()) {
								sendJson(res, 400, { ok: false, error: 'not a regular file' })
								return
							}
							writeFileSync(target, body.text, 'utf8')
							sendJson(res, 200, { ok: true })
						} catch (err) {
							sendJson(res, 500, {
								ok: false,
								error: '保存失败: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})

				// ── 新建文件：在目录里创建空文件（同名自动加序号）──────────
				const disposeFilesCreate = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/files/create',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const body = parsed.value
						const dir = resolveAbs(body && body.dir)
						if (dir === null) {
							sendJson(res, 400, { ok: false, error: 'dir must be absolute' })
							return
						}
						const raw = typeof body.name === 'string' ? body.name.trim() : ''
						if (!raw || raw.includes('/') || raw.includes('\\') || raw === '.' || raw === '..') {
							sendJson(res, 400, { ok: false, error: 'invalid file name' })
							return
						}
						try {
							const st = statSync(dir)
							if (!st.isDirectory()) {
								sendJson(res, 400, { ok: false, error: 'not a directory' })
								return
							}
						} catch {
							sendJson(res, 404, { ok: false, error: '目录不存在' })
							return
						}
						// 同名存在 → untitled-2.txt 式加序号
						let name = raw
						let idx = 2
						const dot = raw.lastIndexOf('.')
						const stem = dot > 0 ? raw.slice(0, dot) : raw
						const ext = dot > 0 ? raw.slice(dot) : ''
						while (existsSync(join(dir, name))) {
							name = stem + '-' + idx + ext
							idx += 1
						}
						const file = join(dir, name)
						try {
							writeFileSync(file, '', 'utf8')
							sendJson(res, 200, { ok: true, path: file, name })
						} catch (err) {
							sendJson(res, 500, {
								ok: false,
								error: '创建失败: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})

				// ── 简易终端：open / read / write / close（spawn 进程 + 增量轮询）──
				const disposeTermOpen = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/terminal/open',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const body = parsed.value
						const kind = body && body.kind === 'git' ? 'git' : 'powershell'
						const cwd = resolveAbs(body && body.cwd)
						if (cwd === null) {
							sendJson(res, 400, { ok: false, error: 'cwd must be absolute' })
							return
						}
						try {
							const st = statSync(cwd)
							if (!st.isDirectory()) {
								sendJson(res, 400, { ok: false, error: 'not a directory' })
								return
							}
						} catch {
							sendJson(res, 404, { ok: false, error: '目录不存在' })
							return
						}
						let sessionId
						try {
							sessionId = openTerminalSession(kind, cwd)
						} catch (err) {
							sendJson(res, 500, {
								ok: false,
								error: '终端启动失败: ' + (err && err.message ? err.message : String(err)),
							})
							return
						}
						sendJson(res, 200, { ok: true, sessionId, kind })
					},
				})
				const disposeTermRead = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/terminal/read',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const session = terminalSessions.get(parsed.value && parsed.value.sessionId)
						if (!session) {
							sendJson(res, 404, { ok: false, error: 'session not found' })
							return
						}
						const buf = session.buffer
						session.buffer = Buffer.alloc(0)
						session.lastRead = Date.now()
						// READY 后自动发 base64 探测命令，确定输出编码（只发一次）
						if (session.kind !== 'git' && !session.probeSent && buf.toString('utf8').includes('__JARVIS_READY__')) {
							session.probeSent = true
							const probeB64 = Buffer.from("Write-Output '编码探测中文'", 'utf8').toString('base64')
							session.proc.stdin.write(
								"& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
									probeB64 +
									"'))))\n",
							)
						}
						const output = decodeTerminalBuffer(session, buf)
						sendJson(res, 200, {
							ok: true,
							output,
							exited: session.proc.exitCode !== null,
						})
					},
				})
				const disposeTermWrite = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/terminal/write',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const body = parsed.value
						const session = terminalSessions.get(body && body.sessionId)
						if (!session) {
							sendJson(res, 404, { ok: false, error: 'session not found' })
							return
						}
						const input = typeof body.input === 'string' ? body.input : ''
						if (!input) {
							sendJson(res, 200, { ok: true })
							return
						}
						try {
							// 含非 ASCII 的输入用 base64 包装成纯 ASCII 命令执行，
							// 绕开 PowerShell 5.1 管道 stdin 的编码问题
							if (session.kind !== 'git' && /[^\x00-\x7f]/.test(input)) {
								const b64 = Buffer.from(input, 'utf8').toString('base64')
								session.proc.stdin.write(
									"& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
										b64 +
										"'))))\n",
								)
							} else {
								session.proc.stdin.write(input)
							}
							sendJson(res, 200, { ok: true })
						} catch (err) {
							sendJson(res, 500, {
								ok: false,
								error: '写入失败: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})
				const disposeTermClose = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/terminal/close',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const session = terminalSessions.get(parsed.value && parsed.value.sessionId)
						if (!session) {
							sendJson(res, 200, { ok: true })
							return
						}
						try {
							session.proc.kill()
						} catch {
							/* 已退出 */
						}
						terminalSessions.delete(parsed.value.sessionId)
						sendJson(res, 200, { ok: true })
					},
				})

				// ── Git 状态：目录 → 相对路径状态表（orca 文件树状态标签）──
				const disposeGitStatus = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/git/status',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const target = resolveAbs(parsed.value && parsed.value.path)
						if (target === null) {
							sendJson(res, 400, { ok: false, error: 'path must be absolute' })
							return
						}
						try {
							const st = statSync(target)
							if (!st.isDirectory()) {
								sendJson(res, 400, { ok: false, error: 'not a directory' })
								return
							}
						} catch {
							sendJson(res, 404, { ok: false, error: '目录不存在' })
							return
						}
						let proc
						try {
							proc = spawnSync(
								'git',
								['-C', target, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
								{
									encoding: 'utf8',
									timeout: GIT_STATUS_TIMEOUT_MS,
									windowsHide: true,
									maxBuffer: GIT_STATUS_MAX_BUFFER,
								},
							)
						} catch {
							sendJson(res, 200, { ok: true, git: false, statuses: {} })
							return
						}
						// 非 git 仓库 / git 缺失 / 超时 → 无状态，不报错
						if (proc.error || proc.status !== 0 || proc.signal) {
							sendJson(res, 200, { ok: true, git: false, statuses: {}, diffs: {} })
							return
						}
						// 增删行数：合并工作区（diff）与暂存区（diff --cached）numstat
						const diffs = {}
						try {
							const wt = spawnSync(
								'git',
								['-C', target, 'diff', '--numstat', '-z'],
								{
									encoding: 'utf8',
									timeout: GIT_STATUS_TIMEOUT_MS,
									windowsHide: true,
									maxBuffer: GIT_STATUS_MAX_BUFFER,
								},
							)
							const st = spawnSync(
								'git',
								['-C', target, 'diff', '--cached', '--numstat', '-z'],
								{
									encoding: 'utf8',
									timeout: GIT_STATUS_TIMEOUT_MS,
									windowsHide: true,
									maxBuffer: GIT_STATUS_MAX_BUFFER,
								},
							)
							if (wt.status === 0) Object.assign(diffs, parseGitNumstat(wt.stdout))
							if (st.status === 0) {
								for (const [p, v] of Object.entries(parseGitNumstat(st.stdout))) {
									const prev = diffs[p]
									diffs[p] = prev
										? {
												additions: prev.additions + v.additions,
												deletions: prev.deletions + v.deletions,
											}
										: v
								}
							}
						} catch {
							/* numstat 失败不影响状态表 */
						}
						sendJson(res, 200, {
							ok: true,
							git: true,
							statuses: parseGitPorcelain(proc.stdout),
							diffs,
						})
					},
				})

				// ── Git 操作：提交（add -A + commit）/ 推送 / 更新 ─────────
				const disposeGitOp = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/git/op',
					handler: async (req, res) => {
						if (req.method !== 'POST') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const parsed = await readJsonBody(req)
						if (parsed.error) {
							sendJson(res, 400, { ok: false, error: parsed.error })
							return
						}
						const body = parsed.value
						const target = resolveAbs(body && body.path)
						if (target === null) {
							sendJson(res, 400, { ok: false, error: 'path must be absolute' })
							return
						}
						const op = body && body.op
						if (op !== 'commit' && op !== 'push' && op !== 'pull') {
							sendJson(res, 400, { ok: false, error: 'op must be commit|push|pull' })
							return
						}
						const message = typeof body.message === 'string' ? body.message.trim() : ''
						if (op === 'commit' && !message) {
							sendJson(res, 400, { ok: false, error: 'commit message is required' })
							return
						}
						try {
							const st = statSync(target)
							if (!st.isDirectory()) {
								sendJson(res, 400, { ok: false, error: 'not a directory' })
								return
							}
						} catch {
							sendJson(res, 404, { ok: false, error: '目录不存在' })
							return
						}
						const run = (args) =>
							spawnSync('git', ['-C', target, ...args], {
								encoding: 'utf8',
								timeout: GIT_OP_TIMEOUT_MS,
								windowsHide: true,
								maxBuffer: GIT_STATUS_MAX_BUFFER,
							})
						const collect = (p) => String(p.stdout || '') + String(p.stderr || '')
						let result
						if (op === 'commit') {
							const add = run(['add', '-A'])
							if (add.error || add.status !== 0) {
								sendJson(res, 200, { ok: false, error: 'git add 失败: ' + collect(add).slice(-400) })
								return
							}
							result = run(['commit', '-m', message])
						} else if (op === 'push') {
							result = run(['push'])
						} else {
							result = run(['pull'])
						}
						if (result.error || result.status !== 0 || result.signal) {
							sendJson(res, 200, { ok: false, error: collect(result).slice(-400) || 'git 操作失败' })
							return
						}
						sendJson(res, 200, { ok: true, output: collect(result).slice(-400) })
					},
				})

				// ── 内置默认壁纸端点 ────────────────────────────────────
				let wallpaperBuf = null
				try {
					wallpaperBuf = readFileSync(WALLPAPER_PATH)
				} catch (err) {
					console.warn('[dsh-theme-jarvis] 内置壁纸缺失:', WALLPAPER_PATH, err.message)
				}
				const disposeWallpaper = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/wallpaper/default',
					handler: (req, res) => {
						if (req.method !== 'GET') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						if (!wallpaperBuf) {
							sendJson(res, 404, { ok: false, error: 'wallpaper not found' })
							return
						}
						res.writeHead(200, {
							'content-type': 'image/png',
							'content-length': wallpaperBuf.length,
							'cache-control': 'public, max-age=86400',
						})
						res.end(wallpaperBuf)
					},
				})

				// ── 支持作者收款码（JARVIS 控制台底部）──────────────────
				let donateBuf = null
				try {
					donateBuf = readFileSync(DONATE_QR_PATH)
				} catch (err) {
					console.warn('[dsh-theme-jarvis] 收款码缺失:', DONATE_QR_PATH, err.message)
				}
				const disposeDonate = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/donate/qrcode',
					handler: (req, res) => {
						if (req.method !== 'GET') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						if (!donateBuf) {
							sendJson(res, 404, { ok: false, error: 'qrcode not found' })
							return
						}
						res.writeHead(200, {
							'content-type': 'image/jpeg',
							'content-length': donateBuf.length,
							'cache-control': 'public, max-age=86400',
						})
						res.end(donateBuf)
					},
				})

				// ── 本地识别服务健康检查代理（浏览器直连会被 CORS 挡，经 host 转发）──
				const disposeLocalHealth = httpCtx.webServer.register({
					kind: 'exact',
					path: '/api/dsh-theme-jarvis/local-stt/health',
					handler: async (req, res) => {
						if (req.method !== 'GET') {
							sendJson(res, 405, { ok: false, error: 'method not allowed' })
							return
						}
						if (!guard(req)) {
							sendJson(res, 403, { ok: false, error: 'loopback only' })
							return
						}
						const cfg = stt()
						if (!cfg.localUrl || !isLocalUrl(cfg.localUrl)) {
							sendJson(res, 503, { ok: false, error: '本地服务地址未配置或非回环地址' })
							return
						}
						try {
							const upstream = await fetch(cfg.localUrl + '/health', {
								method: 'GET',
								signal: AbortSignal.timeout(5000),
							})
							const upstreamBody = await upstream.text().catch(() => '')
							if (!upstream.ok) {
								sendJson(res, 502, {
									ok: false,
									error: '本地服务错误 ' + upstream.status + ': ' + upstreamBody.slice(0, 200),
								})
								return
							}
							let data = null
							try {
								data = JSON.parse(upstreamBody)
							} catch {
								data = null
							}
							sendJson(res, 200, {
								ok: true,
								initialized: !!(data && data.initialized),
							})
						} catch (err) {
							sendJson(res, 502, {
								ok: false,
								error: '无法连接本地服务: ' + (err && err.message ? err.message : String(err)),
							})
						}
					},
				})

				return () => {
					disposeTranscribe()
					disposeConfig()
					disposeLocalHealth()
					disposeFilesList()
					disposeFilesRead()
					disposeFilesWrite()
					disposeFilesCreate()
					disposeTermOpen()
					disposeTermRead()
					disposeTermWrite()
					disposeTermClose()
					disposeGitStatus()
					disposeGitOp()
					disposeWallpaper()
					disposeDonate()
					// 关闭所有遗留终端会话
					for (const s of terminalSessions.values()) {
						try {
							s.proc.kill()
						} catch {
							/* 已退出 */
						}
					}
					terminalSessions.clear()
				}
			},
			'dsh-theme-jarvis: /api transcribe + stt-config + local-stt health + files + terminal + git + wallpaper routes',
		)
		// 终端空闲回收（进程级常驻，与路由生命周期无关）
		const terminalReaper = setInterval(reapIdleTerminals, 60 * 1000)
		terminalReaper.unref?.()
	})
}
