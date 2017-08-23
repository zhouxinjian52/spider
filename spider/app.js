var express = require('express'),
    app = express(),
    request = require('request-promise'),
    iconv = require('iconv-lite'),
    cheerio = require('cheerio'),
    async = require("async"), // 控制并发数，防止被封IP
    fs = require('fs'),
    JSONStream = require('JSONStream'),
    path = require('path'),
    sd = require('silly-datetime');

var fetchData = []; // 存放爬取数据
var fetchResultData = []; // 存放插入数据库的数据，分类插入，一页一次
var count = 0;
var mysql = require('mysql');
var DATABASE = "testdb";
var connection = mysql.createConnection({
    host: '192.168.1.224',
    user: 'tester',
    password: 'test1234',
    port: '3306',
    database: DATABASE
});

connection.connect(function(err) {
    if (err) {
        console.log("连接失败");
    } else {
        console.log("连接成功");
        /**
         * 爬虫入口
         */
        requestIndexPage();
    }
})

/**
 * 睡眠模拟函数
 * @param  {Number} numberMillis 毫秒
 */
function sleep(numberMillis) {
    var now = new Date();
    var exitTime = now.getTime() + numberMillis;
    while (true) {
        now = new Date();
        if (now.getTime() > exitTime)
            return;
    }
}

/**
 * 爬取产品列表地址
 */
function requestIndexPage(req, res) {
    var indexPage = 'http://www.meilele.com/chengdu/';

    var options = {
        url: indexPage
    }
    request(options)
        .then(function(body) {
            // var html = iconv.decode(body, 'utf-8');
            const $ = cheerio.load(body);
            const listHref = $('.menu-map');
            listHref.children('li.large-class').remove();
            const liListAttr = listHref.children('li');
            for (let i = 0; i < liListAttr.length; i++) {
                let aLength = liListAttr.eq(i).children('a').length;
                let t_dom = liListAttr.eq(i);
                for (let k = 0; k < aLength; k++) {
                    const name = t_dom.children('a').eq(k).text();
                    const url = 'http://www.meilele.com' + t_dom.children('a').eq(k).attr('href');
                    const createtime = sd.format(new Date(), 'YYYY-MM-DD HH:mm');
                    const queryData = {
                        url: url.split('?')[0],
                        name,
                        state: 0,
                        createtime
                    }
                    connection.query('select * from bt_meilele_category_zxj where url=?', [queryData.url], function(err, result) {
                        if (err) {
                            console.log("查询失败");
                            console.log(err);
                        } else {
                            console.log("查询成功");
                            if (result.length == 0) {
                                connection.query('insert into bt_meilele_category_zxj set ?', queryData, function(err, results) {
                                    if (err) {
                                        console.log("插入失败");
                                        console.log(err);
                                    } else {
                                        console.log("插入成功:" + queryData.url);
                                    }
                                })
                            }else{
                                console.log("当前已存在分类地址:" + queryData.url);
                            }
                        }
                    });

                }
            }
            spiderListData();
        })
        .catch(function(err) {
            console.error(err);
            console.log('抓取首页失败，重新抓取该页面..')
            sleep(100);
            requestIndexPage();
            return false;
        });
}

/**
 * 爬取各产品列表数据
 */
function spiderListData(req, res) {
    var pageUrls = []; // 存放爬取网址

    connection.query('select * from bt_meilele_category_zxj where state = 0', function(err, results) {
        if (err) {
            console.log("查询失败");
            console.log(err);
        } else {
            console.log("查询成功");

            for (let i = 0; i < results.length; i++) {
                pageUrls.push(results[i].url);
            }
            var reptileMove = function(url, callback) {
                requestNextPage(1, url, callback);
            };
            // 使用async控制异步抓取   
            // mapLimit(arr, limit, iterator, [callback])
            // 异步回调
            async.mapLimit(pageUrls, 5, function(url, callback) {
                reptileMove(url, callback);
            }, function(err, result) {
                console.log('----------------------------');
                console.log('产品列表数据抓取完毕！');
                console.log('----------------------------');
            });
        }
    });
}

function requestNextPage(currentPage, url, callback) {
    const startTime = Date.now(); // 记录该次爬取的开始时间
    let myUrl = url + 'list-p' + currentPage + '/';
    console.log('抓取的页码url为：' + myUrl);
    var options = {
        url: myUrl
    };
    request(options)
        .then(function(body) {
            // const html = iconv.decode(body, '');
            const $ = cheerio.load(body);
            const curBrands = $('.list-goods > li');
            fetchData = [];
            curBrands.each(function(data) {
                const content = $(this);
                const result = {
                        prod_id: content.attr('data-goods-id'),
                        prod_name: content.find('.g-dtl > a.d-name').children('span').eq(0).text(),
                        url: 'http://www.meilele.com' + content.find('.g-dtl > a').eq(0).attr('href'),
                        prod_keyword: content.find('.g-dtl > a img').attr('alt'),
                        price: content.find('.g-dtl > .d-price strong .JS_async_price').text().replace('¥', '') || '0.00',
                        reference_price: content.find('.g-dtl > .d-price del').text().replace('¥', '') || content.find('.g-dtl > .d-price strong .JS_async_price').text().replace('¥', '') || '0.00',
                        brand: content.find('.g-dtl > a.d-name').children('span').eq(0).text().split(']')[0].replace('[', ''),
                        prod_detail: content.find('.g-dtl > a.d-name').children('span').eq(0).text(),
                        amount: content.find('.g-dtl > .d-tags .t-sale .JS_async_sale_num').text() || 0,
                        comment_num: content.find('.g-dtl > .d-tags .t-score .JS_async_score').text() || 0,
                        shop_id: content.find('.g-dtl > .d-tags span').hasClass('self') ? 1 : 0
                    }
                    // console.log(result);
                fetchData.push(result);
            });
            var reptileMove = function(data, callback) {
                getScoreStart(data, callback);
            }
            async.mapLimit(fetchData, 10, function(data, callback) {
                reptileMove(data, callback);
            }, function(err, result) {
                console.log('----------------------------');
                console.log('列表详情抓取完毕');
                InsertProductPageData(fetchResultData);
                if (curBrands.length == 36) {
                    currentPage++;
                    console.log(url + '，当前第' + currentPage + '页');
                    sleep(1000);
                    requestNextPage(currentPage, url, callback);
                } else {
                    updateGoodsState(url);
                    callback(null, url + 'Call back content');
                }
                console.log('----------------------------');
            });

        })
        .catch(function(err) {
            console.error(err);
            console.log('抓取该页面失败，重新抓取该页面..')
            sleep(100);
            requestNextPage(currentPage, url, callback);
            return false;
        });


}


function getProductData(data, scoreData, callback) {
    var options = {
        url: data.url
    };
    request(options)
        .then(function(body) {
            const $ = cheerio.load(body);
            const resultData = {
                category_detail: $('.bread-nav > .bitem').eq(1).find('a').attr('title') + '>' + $('.bread-nav > .bitem').eq(2).find('a').attr('title') + '>' + $('.bread-nav > .bitem').eq(3).find('a').attr('title'),
                prod_sort: $('.bread-nav > .bitem').eq(3).find('a').attr('title'),
                score: scoreData.comment_all_rank,
                good_score: scoreData.comment_level_count.high,
                medium_score: scoreData.comment_level_count.middle,
                bad_score: scoreData.comment_level_count.low,
                shipper: $('#JS_goods_extend_attr_3 > .orange').text(),
                after_sales: $('#JS_goods_extend_attr_3 > .orange').text(),
                service_provider: $('#JS_goods_extend_attr_3 > .orange').text(),
                capture_time: sd.format(new Date(), 'YYYY-MM-DD HH:mm'),
                capturer: 'zhouxinjian',
                createtime: sd.format(new Date(), 'YYYY-MM-DD HH:mm'),
                creator: 'zhouxinjian'
            }
            fetchResultData.push({...resultData, ...data });
            console.log(data.url);
            callback(null, data.url + 'Call back content');
        })
        .catch(function(err) {
            console.error(err);
            console.log('抓取' + data.url + '详情页面失败，重新抓取该页面..')
            sleep(100);
            getProductData(data, scoreData, callback);
            return false;
        });
}

function getScoreStart(data, callback) {
    request({
            url: 'http://www.meilele.com/mll_api/api/goods_comment',
            method: "GET",
            qs: {
                goods_id: data.prod_id
            },
            json: true,
            headers: {
                "content-type": "application/json",
                "User-Agent": "Request-Promise"
            }
        })
        .then(function(json) {
            getProductData(data, json, callback)
        })
        .catch(function(err) {
            console.error(err);
            console.log('获取goods_comment接口失败，重新抓取该页面..goodsId:' + data.prod_id)
            getScoreStart(data, callback);
            return false;
        });
}

function InsertProductPageData(JsonData) {
    JsonData.map(function(data) {
        const queryData = {
            ...data
        }
        connection.query('insert into bt_meilele_product_zxj set ?', queryData, function(err, results) {
            if (err) {
                console.log("插入失败");
                console.log(err);
            } else {
                // console.log("插入成功");
                count++; // 总数
                console.log('当前抓取数量为：' + count);
            }
        })
    });
    fetchResultData = [];
}


function updateGoodsState(url) {
    console.log('-----------------')
    console.log(url);
    connection.query('update bt_meilele_category_zxj set state=? where url=?', [1, url], function(err, result) {
        if (err) throw err;
        console.log('updated ' + url + 'state to 1');
        console.log(result);
        console.log('\n');
    });
}