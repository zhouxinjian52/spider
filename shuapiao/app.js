var express = require('express'),
    request = require('request'),
    iconv = require('iconv-lite'),
    cheerio = require('cheerio'),
    async = require("async"), // 控制并发数，防止被封IP
    querystring = require("querystring"),
    http = require("http"),
    url = require("url");


let SUCCESS = 0;
// 要访问的目标页面
const targetUrl = "http://www.xinyegou.cn/index.php?g=Wap&m=Vote&a=ticket";
const urlParsed = url.parse(targetUrl);
// 代理服务器
const proxyHost = "http-dyn.abuyun.com";
const proxyPort = 9020;

// 代理隧道验证信息
const proxyUser = "HH4HYVJ3T94ZMM1D";
const proxyPass = "8CD00E13D92FE8D4";

const proxyUrl = "http://" + proxyUser + ":" + proxyPass + "@" + proxyHost + ":" + proxyPort;

const proxiedRequest = request.defaults({ 'proxy': proxyUrl });
const base64 = new Buffer(proxyUser + ":" + proxyPass).toString("base64");

const options = {
    host: proxyHost,
    port: proxyPort,
    path: targetUrl,
    method: "POST",
    headers: {
        "Referer": "http://www.xinyegou.cn/index.php?g=Wap&m=Vote&a=detail&token=Eioa5C5oj3S32qhH&id=13&zid=149",
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Host": "www.xinyegou.cn",
        "Origin": "http://www.xinyegou.cn",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Mobile/14G60 MicroMessenger/6.5.14 NetType/WIFI Language/zh_CN",
        "X-Requested-With": "XMLHttpRequest",
        "Host": urlParsed.hostname,
        "Proxy-Authorization": "Basic " + base64
    }
};

function sleep(numberMillis) {
    var now = new Date();
    var exitTime = now.getTime() + numberMillis;
    while (true) {
        now = new Date();
        if (now.getTime() > exitTime)
            return;
    }
}

function spider() {
    options.headers['Cookie'] = "PHPSESSID=o4i2qmhs9ekjpvk3q9por2sn22; wxd_openid=Eioa5C5oj3S32qhH; dzp_openid=Eioa5C5oj3S32qhH"

    // console.log("got response: " + res.statusCode);
    // console.log("body:" + body);
    const postData = querystring.stringify({
        zid: 149,
        vid: 13,
        token: 'Eioa5C5oj3S32qhH',
        // __hash__: $('input[name="__hash__"]').val(),
        // tttid: $('input[name="tttid"]').val()
    });

    const req = http.request(options, function(res) {
        console.log("got response: " + res.statusCode);
        console.log(res.headers['set-cookie']);
        res.on('data', function(body) {
            console.error("body:" + body);
            if (body == 108) {
                SUCCESS++;
            }
            console.error('成功刷了：' + SUCCESS + '次')
            sleep(Math.ceil(Math.random()*1000));
            if (body == 107) {
                sleep(Math.ceil(Math.random()*15000));
            }
            spiderSet();
        })
    }).on('error', function(err) {
        console.error("err:" + err);
        console.log('error');
        sleep(1000);
        spiderSet();
    })

    // 写入数据到请求主体
    req.write(postData);
    req.end();
}

function spiderSet(req, res) {
    proxiedRequest
        .get({
            url: "http://www.xinyegou.cn/index.php?g=Wap&m=Vote&a=detail&token=Eioa5C5oj3S32qhH&id=13&zid=149"
        }, function(err, res, body) {
            if (err || res.statusCode != 200) {
                console.error(err);
                console.log('抓取该页面失败，重新抓取该页面..');
                sleep(100);
                spiderSet();
                return false;
            }

            var html = iconv.decode(body, 'UTF-8')
            var $ = cheerio.load(html);

            const cookies = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
            console.log(cookies);

            options.headers['Cookie'] = "PHPSESSID=" + cookies + "; wxd_openid=Eioa5C5oj3S32qhH; dzp_openid=Eioa5C5oj3S32qhH"

            // console.log("got response: " + res.statusCode);
            // console.log("body:" + body);
            const postData = querystring.stringify({
                zid: 149,
                vid: 13,
                token: 'Eioa5C5oj3S32qhH',
                __hash__: $('input[name="__hash__"]').val(),
                tttid: $('input[name="tttid"]').val()
            });

            const req = http.request(options, function(res) {
                console.log("got response: " + res.statusCode);
                console.log(res.headers['set-cookie']);
                res.on('data', function(body) {
                    console.error("body:" + body);
                    if (body == 108) {
                        SUCCESS++;
                    }
                    console.error('成功刷了：' + SUCCESS + '次')
                    sleep(100);
                    spiderSet();
                })
            }).on('error', function(err) {
                console.error("err:" + err);
                console.log('error');
                sleep(100);
                spiderSet();
            })

            // 写入数据到请求主体
            req.write(postData);
            req.end();
        })
}
// spiderSet();
var cluster = require('cluster');
var numCPUs = 5;

console.time('5 cluster');
if (cluster.isMaster) {
    console.log(111111111);
    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
        sleep(Math.ceil(Math.random()*1000)+300);
        cluster.fork();
    }
    var i = numCPUs;
    cluster.on('exit', function(worker, code, signal) {
        if (!--i) {
            console.timeEnd('5 cluster');
            process.exit(0);
        }
    });
} else {
    console.log(22222222222);
    spider();
    // process.exit(0);
}
