const http = require('http');
const https = require('https');
const fs = require('fs');
const spawn = require('child_process').spawn;
const express = require('express');
const bodyParser = require('body-parser');
const { join } = require('path');
const cron = require('node-cron');
const schedule = require('node-schedule');
const request = require('request');
const dateFormater = require('date-and-time')

const config = require('dotenv').config();
console.log("PORT=", process.env.PORT);
console.log("CMS_USE_SSL=", process.env.CMS_USE_SSL);
console.log("CMS_HOST=", process.env.CMS_HOST);
console.log("CMS_PORT=", process.env.CMS_PORT);
console.log("START_JOB_GET_SCHEDULE=", process.env.START_JOB_GET_SCHEDULE);
console.log("VIDEO_KEEP_DAY=", process.env.VIDEO_KEEP_DAY);
var schedules = [];
var currentDateJob = "";
var files = [];
const port = process.env.PORT;
const keepDay = process.env.VIDEO_KEEP_DAY;

var id = 0;

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
    response.end(schedules);
});

/**
 * add new schedule create video with broadcast url and time
 */
app.post('/schedule/add', (request, response) => {
    console.log(`URL: ${request.url}`);
    console.log(request.body);
    id += 1;
    var sch = addSchedule(
        request.body.id,
        request.body.channel,
        request.body.date,
        request.body.fileName,
        request.body.streamPath,
        request.body.startDate,
        request.body.endDate);
    if (sch != null) {
        schedules.push(request.body.id);
        response.send(sch?.videoName);
    }
    else {
        console.log("existed");
        response.status(422).send("schedule existed");
    }
});
app.post('/schedule/addMore', (request, response) => {
    console.log(`URL: ${request.url}`);
    if (Array.isArray(request.body)) {
        console.log(request.body.length);
        var messages = [];
        for (var i = 0; i < request.body.length; i++) {
            var b = request.body[i];
            var sch = addSchedule(
                b.id,
                b.channel,
                b.date,
                b.fileName,
                b.streamPath,
                b.startDate,
                b.endDate);
            if (sch != null) {
                schedules.push(b.id);
                messages.push(sch?.videoName);
            }
            else {
                messages.push("schedule existed");
            }
        }
        response.send("success " + request.body.length);
    }
    else {
        response.status(500).send("body is not a array");
    }
});
app.post('/schedule/start', (request, response) => {
    console.log(`URL: ${request.url}`);
    getSchedules();
    response.send("force start " + request.body.length);

});
var regOnlyNumber = new RegExp(/[^0-9]/gm);
if (process.env.START_JOB_GET_SCHEDULE.length > 0) {
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(process.env.START_JOB_GET_SCHEDULE.split(":")[0]);
    rule.minute = parseInt(process.env.START_JOB_GET_SCHEDULE.split(":")[1]);
    rule.second = 0;
    getSchedules();
    const job = schedule.scheduleJob("getSchedules", rule, function () {
        getSchedules();
    }, function (e) {
        console.log("get schedules!");
        console.log(e);
    });
}
function deleteFolderOld(channel) {
    var keepFolders = [];
    var dirs = fs.readdirSync('./videos/' + channel);
    for (var i = 0; i < keepDay; i++) {
        var rmDate = dateFormater.addDays(new Date(), -i);
        var dateStr = dateFormater.format(rmDate, "YYYYMMDD");
        keepFolders.push(dateStr);
    }
    for (var i = 0; i < dirs.length; i++) {
        var dir = './videos/' + channel + "/" + dirs[i];
        var isKeepDir = keepFolders.filter((e) => { return e == dirs[i]; }).length > 0;
        if (!isKeepDir && fs.existsSync(dir)) {
            console.log(">>>remove dir: " + dir);
            fs.rmSync(dir, { force: true, recursive: true });
        }
    }
}

function getSchedules() {
    var data = '';
    var currentDate = new Date();
    currentDate = dateFormater.addDays(currentDate, 1);
    currentDateJob = dateFormater.format(currentDate, "YYYY-MM-DD");
    console.log("run at: " + currentDate);
    console.log("for date: " + currentDateJob);
    schedules = [];
    var postData = JSON.stringify({
        model: { BroadcastName: currentDateJob }
    });

    var options = {
        hostname: process.env.CMS_HOST,
        port: parseInt(process.env.CMS_PORT),
        path: '/api/BroadcastSchedule/GetBroadCastsForJob',
        method: 'POST',
        headers: {
            'accept': '*/*',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };
    var _http = http;
    if (process.env.CMS_USE_SSL == "1") {
        _http = https;
    }
    var request = _http.request(options, (response) => {
        console.log(response.statusCode, response.statusMessage);
        // Set the encoding, so we don't get log to the console a bunch of gibberish binary data
        response.setEncoding('utf8');
        // As data starts streaming in, add each chunk to "data"
        response.on('data', (chunk) => {
            data += chunk;
        });
        // The whole response has been received. Print out the result.
        response.on('end', () => {
            // console.log(data);
            if(data.length == 0){
                return;
            }
            var arr = JSON.parse(data);
            if (arr.length > 0) {
                for (var i = 0; i < arr.length; i++) {
                    var sch = addSchedule(
                        arr[i].id,
                        arr[i].channel,
                        arr[i].date,
                        arr[i].fileName,
                        arr[i].streamPath,
                        arr[i].startDate,
                        arr[i].endDate);
                    deleteFolderOld(arr[i].channel);
                    schedules.push(arr[i].id);
                }
            }
        });
    });

    request.on('error', (error) => {
        console.error("error");
        console.error(error);
    });

    request.write(postData);

    // End the request
    request.end();
}
/**
 * 
 * @param {*} id id
 * @param {*} streamPath file .m3u8
 * @param {*} startDateStr start date 2019-01-01T00:00:00
 * @param {*} endDateStr end date 2019-01-01T00:00:00
 * @returns 
 */
function addSchedule(id, channel, date, fileName, streamPath, startDateStr, endDateStr) {
    //2019-01-01T00:00:00
    var exist = schedules.filter((e) => { return e == id; }).length > 0;
    if (!startDateStr
        || startDateStr == ''
        || !endDateStr
        || endDateStr == ''
        || exist) {
        return null
    }
    var startDate = new Date(startDateStr);
    var endDate = new Date(endDateStr);
    startDate = addMinutes(startDate, 3);
    endDate = addMinutes(endDate, 3);
    //for testing
    // console.log(startDate);
    // console.log(endDate);
    // startDate = new Date();
    // endDate = addMinutes(new Date(), 1);

    var videoName = fileName;
    var timeMs = (endDate - startDate) / 1000;
    var res = {
        id,
        channel,
        videoName,
        schedule,
        date,
        added: false
    };
    var dir = './videos/' + channel + "/" + date;

    if (!fs.existsSync('./videos/')) {
        fs.mkdirSync('./videos/');
    }

    if (!fs.existsSync('./videos/' + channel)) {
        fs.mkdirSync('./videos/' + channel);
    }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    var fileId = channel + "_" + videoName + "_" + id;
    console.log(fileId);
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

function addMinutes(date, minutes) {
    date.setMinutes(date.getMinutes() + minutes);

    return date;
}
function downloadBasic(time, dir, streamPath, videoName) {
    var cmd = 'ffmpeg';
    var name = dir + "/" + videoName;

    var args = [
        '-y',
        '-i', streamPath,
        '-t', time,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        name + '.mp4'
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
