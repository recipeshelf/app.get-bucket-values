// tests.js

var _ = require('lodash')
var assert = require('assert')

const fs = require('fs')
const path = require('path')

require('util.promisify/shim')()
const redis = require('redis-promisify')

const index = require('./index')

const getCollectionsEvent = {
    'bucket': 'collections'
}

const getRegionsEvent = {
    'bucket': 'region'
}

const getCuisinesEvent = {
    'bucket': 'cuisine'
}

const getCollectionsGalleryChatEvent = {
    'bucket': 'collections',
    'forChat': true
}

const getCuisinesGalleryChatEvent = {
    'bucket': 'cuisine',
    'forChat': true
}

const whenLoadTestData = () => {
    const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'testdata.json')))
    const client = redis.createClient(process.env.CACHE_ENDPOINT)
    return client.flushdbAsync()
                .then(() => {
                    const trans = client.multi()
                    for (const key of _.keys(testData))
                    {
                        if (Array.isArray(testData[key])) {
                            for (const value of testData[key])
                            {
                                if (_.isObject(value)) {
                                    for (const id of _.keys(value))
                                        trans.zadd(key, value[id], id)
                                }
                                else
                                    trans.sadd(key, testData[key])
                            }
                        }
                        else
                        {
                            for (const hashField of _.keys(testData[key]))
                                trans.hset(key, hashField, testData[key][hashField])
                        }
                    }
                    return trans.execAsync()
                })
                .then(() => client.quitAsync())
}

let testMessages = [], tests = []
  
tests.push(index.whenHandler()
        .catch(err => {
            testMessages.push('Errors are bubbled up')
            assert.equal(err.message, 'Invalid event - undefined')
            return Promise.resolve()
        }))

tests.push(whenLoadTestData()
                .then(() => index.whenHandler(getCollectionsEvent))
                .then(results => {
                    results.sort()
                    testMessages.push('Get collections')
                    assert.deepEqual(results, ['Curries','Dinner','Lunch','Main course','One-pot meals','Rice dishes','Side dishes'])
                    return Promise.resolve()
                })         
                .then(() => index.whenHandler(getCollectionsGalleryChatEvent))
                .then(results => {
                    testMessages.push('Get collections gallery')
                    assert.equal(results.messages[0].attachment.payload.elements.length, 7)                    
                    const title = results.messages[0].attachment.payload.elements[0].title
                    assert.deepEqual(results.messages[0].attachment.payload.elements[0], {
                        'title':title,
                        'image_url':'https://res.cloudinary.com/recipe-shelf/image/upload/v1484217570/stock-images/' + title + '.jpg',
                        'item_url':'https://www.recipeshelf.com.au/collections/' + title.toLowerCase() + '/'
                    })
                    return Promise.resolve()
                })
                .then(() => index.whenHandler(getRegionsEvent))
                .then(results => {
                    results.sort()
                    testMessages.push('Get regions')
                    assert.deepEqual(results, ['Indian Subcontinent'])
                    return Promise.resolve()
                })
                .then(() => index.whenHandler(getCuisinesEvent))
                .then(results => {
                    results.sort()
                    testMessages.push('Get cuisines')
                    assert.deepEqual(results, ['South Indian'])
                    return Promise.resolve()
                })
                .then(() => index.whenHandler(getCuisinesGalleryChatEvent))
                .then(results => {
                    results.messages[0].attachment.payload.elements.sort((a, b) => a.title.localeCompare(b.title))
                    testMessages.push('Get cuisines gallery')
                    assert.equal(results.messages[0].attachment.payload.elements.length, 1)                    
                    assert.deepEqual(results.messages[0].attachment.payload.elements[0], {
                        'title':'South Indian',
                        'image_url':'https://res.cloudinary.com/recipe-shelf/image/upload/v1484217570/stock-images/South Indian.jpg',
                        'item_url':'https://www.recipeshelf.com.au/cuisine/south indian/'
                    })
                    return Promise.resolve()
                })
            )            

Promise.all(tests)
        .then(() => {
            console.info(_.map(testMessages, m => m + ' - passed').join('\n'))
            process.exit()
        })
        .catch(err => {
            console.error(err)
            process.exit()            
        })


