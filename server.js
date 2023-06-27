const http = require('http');
const fs = require('fs');
const ffmpeg = require('ffmpeg');
const spawn = require('child_process').spawn;
const express = require('express');
const bodyParser = require('body-parser');
var cron = require('node-cron');
var schedule = require('node-schedule');
const { join } = require('path');
var port = 3000;
const dateFormater = require('date-and-time')
var schedules = [];


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
            date: sch.date,
            isRunning: sch.isRunning
        }
    })));
});


app.post('/schedule/add', (request, response) => {
    console.log(`URL: ${request.url}`);
    console.log(request.body);
    var sch = addSchedule(
        request.body.id,
        request.body.streamPath,
        request.body.startDate,
        request.body.endDate);
    if (sch != null) {
        schedules.push(sch);
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
function addSchedule(id, streamPath, startDateStr, endDateStr) {
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
        videoName,
        schedule,
        date: dateFormater.format(startDate, "YYYYMMDD"),
        isRunning: true
    };
    var dir = './videos/' + dateFormater.format(startDate, "YYYYMMDD");
    console.log(dir);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    const job = schedule.scheduleJob(videoName, {
        start: startDate,
        end: endDate,
        rule: '* * * * * *'
    }, function () {
        downloadBasic(timeMs, dir + "/" + videoName, streamPath);
        schedule.cancelJob(videoName);
    }, function () {
        res.isRunning = false;
        console.log("stop");
    });

    return res;
}


function downloadBasic(time, name, streamPath) {
    var cmd = 'ffmpeg';
    var videoSize = "640x480";
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

    proc.stdout.on('data', function (data) {
        //console.log(data);
    });

    proc.stderr.setEncoding("utf8")
    proc.stderr.on('data', function (data) {
        //console.log(data);
    });

    proc.on('close', function () {
        console.log('download finished');
    });
}