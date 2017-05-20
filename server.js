require('dotenv').config()
const express = require('express')
const cors = require('cors')
const request = require('request')
const xml2object = require('xml2object')
const moment = require('moment')
const Twitter = require('twitter')
const tru = val => Boolean(val)
const twitterStatusUrl = name => `https://twitter.com/${name}/status`
const githubEventsUrl = name => `https://api.github.com/users/${name}/events/public`
const githubSubscriptionsUrl = name => `https://api.github.com/users/${name}/subscriptions`
const {
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_BEARER_TOKEN,
  TWITTER_SCREEN_NAME,
  GITHUB_USER_NAME,
  CODEPEN_COLLECTION_FEED_URL,
  PORT
} = process.env

/*
Setup the Twitter API client. For bearer token curl example, see:
http://stackoverflow.com/questions/36823839/why-are-post-requests-to-get-a-bearer-token-for-application-only-auth-for-twitte
*/
const twitter = new Twitter({
  consumer_key: TWITTER_CONSUMER_KEY,
  consumer_secret: TWITTER_CONSUMER_SECRET,
  bearer_token: TWITTER_BEARER_TOKEN
})

/*
Setup global middleware.
*/
const app = express()
app.use(cors())

/*
Setup the tweets route:
- Proxy the request to the Twitter API to get my timeline.
- Map over my tweets and create a new array of simpler representations.
- Respond with the resulting array of tweets.
*/
app.get('/tweets', (req, res) => {
  const params = {
    screen_name: TWITTER_SCREEN_NAME,
    count: 3,
    trim_user: true,
    include_rts: false,
    contributor_details: false,
    exclude_replies: true
  }
  twitter.get('statuses/user_timeline', params).then(data => {
    const tweets = data.map(item => {
      const { text, created_at } = item
      return {
        url: `${twitterStatusUrl(params.screen_name)}/${item.id_str}`,
        time: moment(created_at).fromNow(true),
        text
      }
    })
    res.json(tweets)
  })
})

/*
Setup the CodePen route:
- Proxy the request to my CodePen collection feed.
- Transform the feed XML response to an array of objects.
- Iterate the array and push transformed versions of the top few entries to a new array.
- Respond with the array of entries sorted by date.
*/
app.get('/pens', (req, res) => {
  const maxResults = 4
  const url = CODEPEN_COLLECTION_FEED_URL
  const parser = new xml2object(['item'])
  const items = []
  parser.on('object', (name, obj) => {
    const momnt = moment(obj['dc:date'])
    items.push({
      date: momnt.format('D MMM YYYY'),
      datetime: momnt.format('YYYY-MM-DD'),
      title: obj.title,
      url: obj.link
    })
  })
  parser.on('end', () => {
    const responseData = items
      .sort((a, b) => a.datetime < b.datetime)
      .slice(0, maxResults)
    res.json(responseData)
  })
  request(url).pipe(parser.saxStream)
})

/*
Setup the GitHub activity route:
- Proxy the request to the GitHub events API to get my public events.
- Create a new array containing only my push events.
- Transform each item to a simpler format.
- Respond with the first few items from the array of push events.
*/
app.get('/activity', (req, res) => {
  const params = {
    url: githubEventsUrl(GITHUB_USER_NAME),
    headers: {
      'User-Agent': 'request'
    }
  }
  return request(params, (err, resp, body) => {
    const data = JSON.parse(body)
    const pushes = data
      .filter(item => item.type === 'PushEvent')
      .map(item => ({
        hash: item.payload.commits[0].sha.slice(0, 7),
        url: item.repo.url,
        repo: item.repo.name,
        message: item.payload.commits[0].message
      }))
      .slice(0, 3)
    res.json(pushes)
  })
})

/*
Setup the projects route.
*/
app.get('/projects', (req, res) => {
  const params = {
    url: githubSubscriptionsUrl(GITHUB_USER_NAME),
    headers: {
      'User-Agent': 'request'
    }
  }
  return request(params, (err, resp, body) => {
    const data = JSON.parse(body)
      .filter(subscription => {
        return [
          subscription.owner.login === GITHUB_USER_NAME,
          subscription.fork === false,
          subscription.description
        ].every(tru)
      })
      .map(subscription => ({
        title: subscription.name,
        url: subscription.html_url,
        text: subscription.description,
        stars: subscription.stargazers_count
      }))
      .sort((a, b) => {
        return a.stargazers_count - b.stargazers_count
      })
      .slice(0, 4)
      .reverse()
    res.json(data)
  })
})

/*
Seeerve.
*/
app.listen(PORT || 3000)
