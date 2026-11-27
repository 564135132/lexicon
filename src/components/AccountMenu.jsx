import { useEffect, useRef, useState } from 'react'
import { createAvatarDataUrl } from '../lib/avatar'
import { describeAccountError } from '../lib/account'
import { MAX_DISPLAY_NAME_LENGTH, profileInitial } from '../lib/profile'
import { CloseIcon, UserIcon } from './Icons'

const SYNC_LABELS = {
  idle: '等待同步',
  syncing: '正在同步…',
  synced: '已同步',
  error: '同步失败',
}

function formatSyncTime(timestamp) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(timestamp),
  )
}

function ProfileAvatar({ profile, fallback = 'L', size = 36, className = '' }) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.44)),
  }
  if (profile?.avatarData) {
    return (
      <img
        className={`account-avatar account-avatar--image ${className}`}
        style={style}
        src={profile.avatarData}
        alt=""
      />
    )
  }
  return (
    <span className={`account-avatar ${className}`} style={style} aria-hidden="true">
      {profileInitial(profile, fallback)}
    </span>
  )
}

export function AccountMenu({ account }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const rootRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const user = account.user
  const isGuest = account.isGuest
  const profile = account.profile
  const displayName = profile.displayName || (isGuest ? '游客账号' : user?.email || '账号')
  const avatarFallback = isGuest ? '游' : (user?.email?.[0]?.toUpperCase() || 'L')
  const label = user
    ? profile.displayName || (isGuest ? '游客' : user.email?.split('@')[0] || '账号')
    : '登录'
  const syncLabel = SYNC_LABELS[account.syncState] ?? SYNC_LABELS.idle
  const syncTime = formatSyncTime(account.lastSyncedAt)

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setMessage('')
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    setError('')
    try {
      if (mode === 'signin') {
        await account.signIn(email.trim(), password)
        setPassword('')
        setMessage('登录成功，正在同步…')
        window.setTimeout(() => setOpen(false), 600)
      } else {
        const data = await account.signUp(email.trim(), password)
        setPassword('')
        if (data?.session) {
          setMessage('注册成功，正在同步…')
          window.setTimeout(() => setOpen(false), 600)
        } else {
          setMessage('注册成功。请打开邮箱里的验证链接，然后再回来登录。')
        }
      }
    } catch (caught) {
      setError(describeAccountError(caught))
    }
  }

  const handleGuest = async () => {
    setMessage('')
    setError('')
    try {
      await account.signInGuest()
      setOpen(false)
    } catch (caught) {
      setError(describeAccountError(caught))
    }
  }

  const handleSignOut = async () => {
    setMessage('')
    setError('')
    try {
      await account.signOut()
      setOpen(false)
    } catch (caught) {
      setError(describeAccountError(caught))
    }
  }

  const startProfileEdit = () => {
    setDraftName(profile.displayName)
    setDraftAvatar(profile.avatarData)
    setProfileError('')
    setProfileMessage('')
    setEditingProfile(true)
  }

  const cancelProfileEdit = () => {
    setEditingProfile(false)
    setProfileError('')
    setProfileMessage('')
  }

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProfileError('')
    try {
      setDraftAvatar(await createAvatarDataUrl(file))
    } catch (caught) {
      setProfileError(caught?.message || '头像处理失败，请换一张图片。')
    }
  }

  const handleProfileSave = async (event) => {
    event.preventDefault()
    setProfileSaving(true)
    setProfileError('')
    setProfileMessage('')
    try {
      await account.updateProfile({ displayName: draftName, avatarData: draftAvatar })
      setEditingProfile(false)
      setProfileMessage('头像和用户名已更新。')
      window.setTimeout(() => setProfileMessage(''), 2600)
    } catch (caught) {
      setProfileError(describeAccountError(caught))
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="account-area" ref={rootRef}>
      <button
        type="button"
        className={`history-trigger account-trigger ${open ? 'history-trigger--open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="账号与同步"
        title={user ? (isGuest ? '游客账号' : user.email) : '登录后同步搜索历史和背景选择'}
      >
        {user ? (
          <ProfileAvatar profile={profile} fallback={avatarFallback} size={20} />
        ) : (
          <UserIcon size={16} />
        )}
        <span className="account-trigger-label">{label}</span>
        {user && (
          <i
            className={`account-dot account-dot--${account.syncState}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div className="account-popover" role="dialog" aria-label="账号与同步">
          <div className="account-head">
            <div>
              <span className="settings-kicker">账号</span>
              <strong>{user ? '云同步' : '登录以同步'}</strong>
            </div>
            <button type="button" className="settings-close" onClick={() => setOpen(false)} aria-label="关闭账号面板">
              <CloseIcon size={15} />
            </button>
          </div>

          {!account.configured && (
            <p className="account-note account-note--warning">
              尚未配置 Supabase。请在 .env.local 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。
            </p>
          )}

          {account.configured && !account.ready && (
            <p className="account-note">正在检查登录状态…</p>
          )}

          {account.configured && account.ready && user && (
            <div className="account-body">
              <div className="account-identity">
                  <ProfileAvatar profile={profile} fallback={avatarFallback} size={36} />
                <div>
                  <strong>{displayName}</strong>
                  <span>
                    {isGuest ? '游客账号' : user.email} · {syncLabel}
                    {account.syncState === 'synced' && syncTime ? ` · ${syncTime}` : ''}
                  </span>
                </div>
                {!editingProfile && (
                  <button type="button" className="account-edit-profile" onClick={startProfileEdit}>
                    编辑资料
                  </button>
                )}
              </div>

              {editingProfile && (
                <form className="profile-editor" onSubmit={handleProfileSave}>
                  <div className="profile-editor-top">
                    <button
                      type="button"
                      className="profile-avatar-button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="更换头像"
                    >
                      <ProfileAvatar
                        profile={{ displayName: draftName, avatarData: draftAvatar }}
                        fallback={avatarFallback}
                        size={56}
                      />
                      <span className="profile-avatar-edit">更换</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      className="profile-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                    />
                    <label className="profile-name-field">
                      <span>用户名</span>
                      <input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        maxLength={MAX_DISPLAY_NAME_LENGTH}
                        placeholder="留空则显示邮箱或“游客账号”"
                        autoFocus
                      />
                    </label>
                  </div>
                  <div className="profile-editor-actions">
                    <button type="submit" className="account-primary" disabled={profileSaving}>
                      {profileSaving ? '保存中…' : '保存资料'}
                    </button>
                    <button
                      type="button"
                      className="account-secondary"
                      onClick={cancelProfileEdit}
                      disabled={profileSaving}
                    >
                      取消
                    </button>
                  </div>
                  <div className="profile-editor-foot">
                    {draftAvatar ? (
                      <button
                        type="button"
                        className="profile-remove-avatar"
                        onClick={() => setDraftAvatar('')}
                      >
                        移除头像
                      </button>
                    ) : (
                      <span>支持 JPG、PNG、WebP</span>
                    )}
                    <span>自动裁剪为方形并压缩</span>
                  </div>
                  {profileError && <p className="account-error">{profileError}</p>}
                </form>
              )}

              {profileMessage && <p className="account-success">{profileMessage}</p>}

              {account.syncError && <p className="account-error">{account.syncError}</p>}

              <div className="account-actions">
                <button
                  type="button"
                  className="account-primary"
                  onClick={() => void account.syncNow()}
                  disabled={account.syncState === 'syncing'}
                >
                  {account.syncState === 'syncing' ? '同步中…' : '立即同步'}
                </button>
                <button
                  type="button"
                  className="account-secondary"
                  onClick={handleSignOut}
                  disabled={account.busy}
                >
                  退出登录
                </button>
              </div>

              <p className="account-note">
                {isGuest
                  ? '游客账号只绑定当前设备。退出或换设备后无法找回数据，建议改用邮箱账号。'
                  : '搜索历史与背景选择会自动同步到云端。'}
              </p>
              {message && <p className="account-success">{message}</p>}
              {error && <p className="account-error">{error}</p>}
            </div>
          )}

          {account.configured && account.ready && !user && (
            <div className="account-body">
              <p className="account-intro">登录后，搜索历史、背景选择、头像和用户名会在设备间同步。</p>

              <div className="account-tabs" role="tablist" aria-label="登录方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  className={mode === 'signin' ? 'account-tab account-tab--active' : 'account-tab'}
                  onClick={() => switchMode('signin')}
                >
                  登录
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={mode === 'signup' ? 'account-tab account-tab--active' : 'account-tab'}
                  onClick={() => switchMode('signup')}
                >
                  注册
                </button>
              </div>

              <form className="account-form" onSubmit={handleSubmit}>
                <label>
                  <span>邮箱</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  <span>密码</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 6 位"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={6}
                    required
                  />
                </label>
                <button type="submit" className="account-primary" disabled={account.busy}>
                  {account.busy ? '请稍候…' : mode === 'signup' ? '注册账号' : '登录'}
                </button>
              </form>

              {message && <p className="account-success">{message}</p>}
              {error && <p className="account-error">{error}</p>}

              <div className="account-divider"><span>或者</span></div>

              <button
                type="button"
                className="account-guest"
                onClick={handleGuest}
                disabled={account.busy}
              >
                以游客身份使用
              </button>
              <p className="account-note">
                游客数据只绑定当前设备；需要跨设备同步时请使用邮箱账号。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
