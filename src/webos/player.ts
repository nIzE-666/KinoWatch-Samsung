import { isWebOS, lunaRequest, LunaResponse } from './service'

export interface VideoPayload {
  fullPath: string
  fileName: string
  thumbnail?: string
  lastPlayPosition?: number
}

interface LaunchResponse extends LunaResponse {
  processId?: string
}

export async function launchNativePlayer(payload: VideoPayload): Promise<void> {
  if (!isWebOS()) {
    window.open(payload.fullPath, '_blank')
    return
  }

  const mediaPayload = [{
    fullPath: payload.fullPath,
    fileName: payload.fileName,
    thumbnail: payload.thumbnail || '',
    lastPlayPosition: payload.lastPlayPosition ?? -1,
    mediaType: 'VIDEO',
    deviceType: 'DMR',
    artist: '',
    album: '',
    subtitle: '',
    dlnaInfo: {
      flagVal: 4096,
      cleartextSize: '-1',
      contentLength: '-1',
      opVal: 1,
      protocolInfo: 'http-get:*:video/mp4:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000',
      duration: 0
    }
  }]

  await lunaRequest<LaunchResponse>(
    'luna://com.webos.applicationManager',
    'launch',
    {
      id: 'com.webos.app.photovideo',
      params: { payload: mediaPayload }
    }
  )
}

export { QUALITY_ORDER, getAvailableQualities, getStreamUrl, withHlsAudioIndex } from '../platform/media'
