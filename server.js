const express = require('express');
const dateFormater = require('date-and-time');
const bodyParser = require('body-parser');
const { join } = require('path');
const sch = require("./schedule.js");
console.log("PORT=", process.env.PORT);
console.log("CMS_USE_SSL=", process.env.CMS_USE_SSL);
console.log("CMS_HOST=", process.env.CMS_HOST);
console.log("CMS_PORT=", process.env.CMS_PORT);
console.log("START_JOB_GET_SCHEDULE=", process.env.START_JOB_GET_SCHEDULE);
console.log("VIDEO_KEEP_DAY=", process.env.VIDEO_KEEP_DAY);
console.log("PATH_SAVE=", process.env.PATH_SAVE);
console.log("MAX_RETRY=", process.env.MAX_RETRY);
var schedules = [];
var currentDateJob = "";
// console.log(sch);

var pathSave = process.env.PATH_SAVE;
var id = 0;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json())

app.use('/videos', express.static(join(pathSave, 'videos')));

// Start the server 
const server = app.listen(process.env.PORT, (error) => {
    if (error)
        return console.log(`Error: ${error}`);
    console.log(`Server listening on port ${server.address().port}`);
});

app.get('/', (request, response) => {
    console.log(`URL: ${request.url}`);
    response.send('Hello, Server!');
});


app.post('/schedule/start', bodyParser.json(), (request, response) => {
    console.log(`URL: ${request.url}`);
    console.log(request.body);
    if(request.body.BroadcastName){
        console.log(request.body.BroadcastName);
        sch.getSchedules(request.body.BroadcastName);
    }
    else{
        sch.getSchedules();
    }
    schedules = sch.schedules;
    response.send("force start " + currentDateJob);
});
var d = new Date();
d = dateFormater.addHours(d, 2)
var currentDate = dateFormater.format(d, "YYYY-MM-DD");

sch.getSchedules(currentDate);