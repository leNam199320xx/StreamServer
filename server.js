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

const sch = require("./schedule.js");

console.log("PORT=", process.env.PORT);
console.log("CMS_USE_SSL=", process.env.CMS_USE_SSL);
console.log("CMS_HOST=", process.env.CMS_HOST);
console.log("CMS_PORT=", process.env.CMS_PORT);
console.log("START_JOB_GET_SCHEDULE=", process.env.START_JOB_GET_SCHEDULE);
console.log("VIDEO_KEEP_DAY=", process.env.VIDEO_KEEP_DAY);
var schedules = [];
var currentDateJob = "";
var files = [];

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
    var sch = sch.addSchedule(
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
            var sch = sch.addSchedule(
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
    if(request.body.length > 0){
        sch.getSchedules(request.body.BroadcastName);
    }
    response.send("force start " + currentDateJob);

});

if (process.env.START_JOB_GET_SCHEDULE.length > 0) {
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(process.env.START_JOB_GET_SCHEDULE.split(":")[0]);
    rule.minute = parseInt(process.env.START_JOB_GET_SCHEDULE.split(":")[1]);
    rule.second = 0;
    //getSchedules();
    const job = schedule.scheduleJob("getSchedules", rule, function () {
        sch.getSchedules();
    }, function (e) {
        console.log("get schedules!");
        console.log(e);
    });
}