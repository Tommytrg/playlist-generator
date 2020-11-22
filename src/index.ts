import http from 'http'
import url from 'url'

import { GaxiosResponse } from 'gaxios'
import { google, youtube_v3 } from 'googleapis'
import destroyer = require('server-destroy')
import opn from 'open'

import songs_example from './songs'

const keys = {
  redirect_uris: [process.env.REDIRECT_URI],
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
}

// FIXME: move inside the class
const oauth2Client = new google.auth.OAuth2(
  keys.client_id,
  keys.client_secret,
  keys.redirect_uris[0]
)

google.options({ auth: oauth2Client })

createPlaylist().catch(console.error)

// FIXME: Move to a separate file
class YoutubeApi {
  youtube
  apiKey

  constructor (apiKey: string) {
    this.apiKey = apiKey

    this.youtube = google.youtube({
      version: 'v3',
    })
  }

  searchMultipleVideos (items: Array<string>) {
    return new Promise((resolve, reject) => {
      Promise.all(items.map(item => this.searchVideo(item)))
        .then(results => {
          resolve(results)
        })
        .catch(e => {
          console.log(e)
          reject(e)
        })
    })
  }

  searchVideo (search: string) {
    return this.youtube.search.list({
      q: search,
      part: ['id', 'snippet'],
      key: this.apiKey,
    })
  }

  async createPlaylist (title: string) {
    return this.youtube.playlists.insert({
      part: ['snippet', 'status'],
      key: this.apiKey,
      requestBody: {
        snippet: {
          title,
        },
        status: {
          privacyStatus: 'private',
        },
      },
    })
  }

  async addPlaylistItem (
    playlistId: string,
    videoId: string,
    position: number
  ) {
    return this.youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          position: position,
          playlistId,
          resourceId: {
            videoId: videoId,
            kind: 'youtube#video',
          },
        },
      },
    })
  }

  // This function is a example from google authenticate
  async authenticate (scopes: Array<string>) {
    /**
     * Open an http server to accept the oauth callback. In this simple example, the only request to our webserver is to /callback?code=<code>
     */
    return new Promise((resolve, reject) => {
      // grab the url that will be used for authorization
      const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes.join(' '),
      })
      const server = http
        .createServer(async (req: any, res: any) => {
          try {
            // if (req.url.indexOf('/oauth2callback') > -1) {
            const qs = new url.URL(req.url, 'http://localhost:3000')
              .searchParams
            res.end('Authentication successful! Please return to the console.')
            server.destroy()
            const { tokens } = await oauth2Client.getToken(
              qs.get('code') as string
            )
            oauth2Client.credentials = tokens // eslint-disable-line require-atomic-updates
            resolve(oauth2Client)
            // }
          } catch (e) {
            reject(e)
          }
        })
        .listen(3000, () => {
          // open the browser to the authorize url to start the workflow
          opn(authorizeUrl, { wait: false }).then((cp: any) => cp.unref())
        })
      destroyer(server)
    })
  }

  async authorize (): Promise<void> {
    const scopes = ['https://www.googleapis.com/auth/youtube']

    return new Promise((resolve, reject) => {
      this.authenticate(scopes)
        .then((_client: any) => resolve())
        .catch(e => {
          console.log(e)
          reject(e)
        })
    })
  }
}

// FIXME: refactor as a Youtube class method
async function createPlaylist () {
  const youtube = new YoutubeApi(process.env.API_KEY as string)

  await youtube.authorize()

  const songs = [songs_example[0], songs_example[1]]

  // FIXME: Improve type
  const searches: Array<any> = (await youtube.searchMultipleVideos(
    songs
  )) as Array<any>

  const playlist = await youtube.createPlaylist('TEST_1')
  const playlistId = playlist.data.id

  Promise.all(
    searches.map(async (videoSearch, index) => {
      let videoId =
        videoSearch &&
        videoSearch.data &&
        videoSearch.data.items &&
        videoSearch.data.items[0]
          ? videoSearch.data.items[0].id?.videoId
          : ''
      console.log('videoID', videoId)
      if (playlistId && videoId) {
        const result2 = await youtube.addPlaylistItem(
          playlistId,
          videoId,
          index
        )
        console.log('result2', result2)
        return result2
      } else {
        return ''
      }
    })
  ).then(results => {
    // FIXME: handle reponse
    console.log('Results:', results)
  })
}

export function getVideoIdFromSearch (
  videoSearch: GaxiosResponse<youtube_v3.Schema$SearchListResponse>
): youtube_v3.Schema$ResourceId | null | undefined {
  return videoSearch.data.items ? videoSearch.data.items[0].id : null
}
