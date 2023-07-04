const http = require('http');
const fs = require('fs');
const spawn = require('child_process').spawn;
const express = require('express');
const bodyParser = require('body-parser');
const { join } = require('path');
const cron = require('node-cron');
const schedule = require('node-schedule');
const request = require('request');
const dateFormater = require('date-and-time')
var schedules = [];
var files = [];
const port = 3000;


const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/videos', express.static(join(__dirname, 'videos')));

// Start the server 
const server = app.listen(port, (error) => {
    if (error)
        return console.log(`Error: ${error}`);
    console.log(`Server listening on port ${server.address().port}`);
});

app.get('/', (request, response) => {
    console.log(`URL: ${request.url}`);
    response.send('Hello, Server!');

});


app.get('/schedule', (request, response) => {
    console.log(`URL: ${request.url}`);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(schedules.map((sch) => {
        return {
            id: sch.id,
            videoName: sch.videoName,
            channel: sch.channel,
            date: sch.date
        }
    })));
});

/**
 * api config schedule run sequence once day once time 
 * this api will call api add to db and set new date with new list of broadcast
 */
app.post('/schedule/config-auto', (request, response) => {


});

/**
 * add new schedule create video with broadcast url and time
 */
app.post('/schedule/add', (request, response) => {
    console.log(`URL: ${request.url}`);
    console.log(request.body);
    var sch = addSchedule(
        request.body.id,
        request.body.channel,
        request.body.streamPath,
        request.body.startDate,
        request.body.endDate);
    if (sch != null) {
        schedules.push(sch);
    }
    else {
        console.log("existed");
    }
    response.send(sch?.videoName);
});

var regOnlyNumber = new RegExp(/[^0-9]/gm);

/**
 * 
 * @param {*} id id
 * @param {*} streamPath file .m3u8
 * @param {*} startDateStr start date 2019-01-01T00:00:00
 * @param {*} endDateStr end date 2019-01-01T00:00:00
 * @returns 
 */
function addSchedule(id, channel, streamPath, startDateStr, endDateStr) {
    //2019-01-01T00:00:00
    if (!startDateStr
        || startDateStr == ''
        || !endDateStr
        || endDateStr == '') {
        return null
    }
    var startDate = new Date(startDateStr);
    var endDate = new Date(endDateStr);
    var videoName = "video_" + dateFormater.format(startDate, "YYYYMMDDHHmmss");
    var timeMs = endDate - startDate;
    var res = {
        id,
        channel,
        videoName,
        schedule,
        date: dateFormater.format(startDate, "YYYYMMDD"),
        added: false
    };
    var dir = './videos/' + channel + "/" + dateFormater.format(startDate, "YYYYMMDD");

    if (!fs.existsSync('./videos/')) {
        fs.mkdirSync('./videos/');
    }

    if (!fs.existsSync('./videos/' + channel)) {
        fs.mkdirSync('./videos/' + channel);
    }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    var fileId = channel + "_" + videoName;
    var rs = files.find(function (v) {
        return v == fileId;
    });


    if (rs) {
        return null;
    }

    files.push(fileId);
    const job = schedule.scheduleJob(fileId, {
        start: startDate,
        end: endDate,
        rule: '* * * * * *'
    }, function () {
        downloadBasic(timeMs, dir, streamPath, videoName);
        schedule.cancelJob(fileId);
    }, function () {
        res.added = true;
        console.log("[" + channel + "] add [" + videoName + "] to schedule successfully ");
    });

    return res;
}


function downloadBasic(time, dir, streamPath, videoName) {
    var cmd = 'ffmpeg';
    var videoSize = "640x480";
    var name = dir + "/" + videoName;
    var args = [
        '-y',
        '-t', time + 'ms',
        '-i', streamPath, // 'http://203.162.235.67/streams/media/nhkw_1920x1080/index.m3u8',
        '-s', videoSize,
        '-codec:a', 'aac',
        '-b:a', '44.1k',
        '-r', '25',
        // '-b:v', '1000k',
        '-c:v', 'h264',
        '-f', 'mp4', name + '.mp4'
    ];

    var proc = spawn(cmd, args);
    var downloaderRunning = false;

    proc.stdout.on('data', function (data) {
        if (!downloaderRunning) {
            console.log("dowwnload [" + name + "] running");
            downloaderRunning = true;
        }
    });

    proc.stderr.setEncoding("utf8")
    proc.stderr.on('data', function (data) {
        if (!downloaderRunning) {
            console.log("download [" + name + "] running");
            downloaderRunning = true;
        }
    });

    proc.on('close', function () {
        console.log("download [" + name + "] successfully");
        schedules = schedules.filter(m => m.added == false && m.videoName != videoName);
    });
}
