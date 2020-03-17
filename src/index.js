import adapter from 'webrtc-adapter'
import QBMediaRecorder from 'media-recorder-js'
import AWS from 'aws-sdk'
import { s3 } from './config'

let rec;
// https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-photo-album.html

var albumBucketName = "mbutler";
var bucketRegion = "us-east-1";
var IdentityPoolId = "us-east-1:6241328d-dbef-44f5-8398-6816d9511825";

AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

/*
AWS.config.region = 'us-east-1'; // Region
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-1:af2db267-d367-4bce-9b0a-05862a21d943',
});
*/


let notify = {
    ui: document.querySelector('.j-notify'),
    hide: function() {
        this.ui.classList.remove('notify-active');
    },
    show: (txt) => {
        this.ui.textContent = txt;
        this.ui.classList.add('notify-active');

        let timerId = setTimeout(function() {
            this.hide();
        }, 5000);
    }
};

let resultCard = {
    blob: null, // saved a blob after stopped a record
    ui: {
        wrap: document.querySelector('.j-result-card'),
        video: document.querySelector('.j-video_result'),
        clear: document.querySelector('.j-clear'),
        download: document.querySelector('.j-download')
    },
    toggleBtn: function(state) {
        this.ui.clear.disabled = state;
        this.ui.download.disabled = state;
    },
    attachVideo: function(blob) {
        this.ui.video.src = URL.createObjectURL(blob);

        this.ui.clear.disabled = false;
        this.ui.download.disabled = false;
    },
    detachVideo: function() {
        this.blob = null;
        this.ui.video.src = '';

        this.ui.clear.disabled = true;
        this.ui.download.disabled = true;
    },
    setupListeners: function(rec) {
        let self = this;

        let evClear = new CustomEvent('clear');
        let evDownload = new CustomEvent('download');

        self.ui.clear.addEventListener('click', function() {
            self.ui.video.pause();
            self.detachVideo();
            
            self.ui.wrap.dispatchEvent(evClear);
        });
        
        self.ui.download.addEventListener('click', function() {
            self.ui.wrap.dispatchEvent(evDownload);
        });
    }
};

let inputCard = {
    audioRecorderWorkerPath: '../qbAudioRecorderWorker.js',
    stream: null,
    devices: {
        audio: [],
        video: []
    },
    ui: {
        wrap: document.querySelector('.j-card'),
        video: document.querySelector('.j-video_local'),

        start: document.querySelector('.j-start'),
        stop: document.querySelector('.j-stop'),
        pause: document.querySelector('.j-pause'),
        resume: document.querySelector('.j-resume'),

        selectAudioSource: document.getElementById('j-audioSource'),
        selectVideoSource: document.getElementById('j-videoSource'),
        selectMimeTypeFormats: document.getElementById('j-mimeTypes')
    },
    _createOptions: function(type) {
        let docfrag = document.createDocumentFragment();

        /* create a default option */
        let optDef = document.createElement('option');
            optDef.textContent = `Choose an input ${type}-device`;
            optDef.value = 'default';

        docfrag.appendChild(optDef);

        /* create a options with available sources */
        this.devices[type].forEach(function(device, index) {
            let option = document.createElement('option');

            option.value = device.deviceId;
            option.textContent = device.label || `${index + 1} ${type} source`;

            docfrag.appendChild(option);
        });

        /* create a option which off a type a media */
        let optOff = document.createElement('option');
        optOff.textContent = `Off ${type} source`;
        optOff.value = 0;

        docfrag.appendChild(optOff);

        return docfrag;
    },
    _createMimeTypesOptions: function(mimeTypes) {
        let docfrag = document.createDocumentFragment();

        mimeTypes.forEach(function(mimeType) {
            let option = document.createElement('option');

            option.value = mimeType;
            option.textContent = mimeType;

            if (mimeType.includes('video')) {
                option.classList.add('j-videoMimeType');
            } else {
                option.classList.add('j-audioMimeType');
                option.disabled = true;
            }

            docfrag.appendChild(option);
        });

        return docfrag;
    },
    _processDevices: function(devices) {
        let self = this;

        let docfragAudio = document.createDocumentFragment(),
            docfragVideo = document.createDocumentFragment();

        devices.forEach(function(device) {
            if(device.kind.indexOf('input') !== -1) {
                if(device.kind === 'audioinput') {
                    /* set audio source to collection */
                    self.devices.audio.push(device);
                }

                if(device.kind === 'videoinput') {
                    /* set video source to collection */
                    self.devices.video.push(device);
                }
            }
        });

        if(self.devices.audio.length > 0) {
            self.ui.selectAudioSource.appendChild( self._createOptions('audio') );
            self.ui.selectAudioSource.classList.remove('invisible');
        }

        if(self.devices.video.length > 0) {
            self.ui.selectVideoSource.appendChild( self._createOptions('video') );
            self.ui.selectVideoSource.classList.remove('invisible');
        }

        if(QBMediaRecorder.getSupportedMimeTypes().length) {
            let audioMimeTypes = QBMediaRecorder.getSupportedMimeTypes("audio"),
                videoMimeTypes = QBMediaRecorder.getSupportedMimeTypes("video"),
                allMimeTypes = videoMimeTypes.concat(audioMimeTypes);

            self.ui.selectMimeTypeFormats.appendChild( self._createMimeTypesOptions(allMimeTypes) );
            self.ui.selectMimeTypeFormats.classList.remove('invisible');
        }
    },
    getDevices: function() {
        let self = this;

        navigator.mediaDevices.enumerateDevices()
            .then(function(devices) {
                 self._processDevices(devices);
            })
    },
    attachStreamToSource: function() {
        this.ui.video.pause();

        try {
          this.ui.video.srcObject = null;
          this.ui.video.srcObject = this.stream;
        } catch (error) {
          this.ui.video.src = '';
          this.ui.video.src = URL.createObjectURL(this.stream);
        }

        this.ui.video.play();
    },
    getUserMedia: function(attrs) {
        let constraints = attrs || { audio: true, video: true };

        return navigator.mediaDevices.getUserMedia(constraints)
    },
    _getSources: function() {
        let sVideo = this.ui.selectVideoSource,
            sAudio = this.ui.selectAudioSource,
            selectedAudioSource = sAudio.options[sAudio.selectedIndex].value,
            selectedVideoSource = sVideo.options[sVideo.selectedIndex].value;

        let constraints = {};

        if(selectedAudioSource === 'default') {
            constraints.audio = true;
        } else if(selectedAudioSource === '0') {
            constraints.audio = false;
            this._toggleAudioTypesSelect(true);
        } else {
            constraints.audio = {deviceId: selectedAudioSource};
        }

        if(selectedVideoSource === 'default') {
            constraints.video = true;
        } else if(selectedVideoSource === '0') {
            constraints.video = false;
        } else {
            constraints.video = {deviceId: selectedVideoSource};
        }

        this._toggleAudioTypesSelect(constraints.video);
        this._toggleVideoTypesSelect(!constraints.video);

        return constraints;
    },
    _toggleAudioTypesSelect: function(state) {
        let audioTypes = document.getElementsByClassName('j-audioMimeType');

        for (let i = 0; i < audioTypes.length; i++) {
            audioTypes[i].disabled = state;
        }
    },
    _toggleVideoTypesSelect: function(state) {
        let videoTypes = document.getElementsByClassName('j-videoMimeType');

        for (let i = 0; i < videoTypes.length; i++) {
            videoTypes[i].disabled = state;
        }
    },
    _stopStreaming: function() {
        this.stream.getTracks().forEach(function(track) {
            track.stop();
        });
    },
    _setupListeners: function() {
        let self = this;

        let evStart = new CustomEvent('started');
        let evPause = new CustomEvent('paused');
        let evResume = new CustomEvent('resumed');
        let evStop = new CustomEvent('stopped');
        let evChange = new CustomEvent('changed');

        self.ui.start.addEventListener('click', function() {
            self.ui.start.disabled = true;
            self.ui.resume.disabled = true;

            self.ui.stop.disabled = false;
            self.ui.pause.disabled = false;

            self.ui.selectMimeTypeFormats.disabled = true;

            self.ui.wrap.dispatchEvent(evStart);
        });

        self.ui.stop.addEventListener('click', function() {
            self.ui.start.disabled = false;

            self.ui.stop.disabled = true;
            self.ui.pause.disabled = true;
            self.ui.resume.disabled = true;

            self.ui.selectMimeTypeFormats.disabled = false;

            self.ui.wrap.dispatchEvent(evStop);
        });

        self.ui.pause.addEventListener('click', function() {
            self.ui.start.disabled = true;
            self.ui.pause.disabled = true;

            self.ui.resume.disabled = false;
            self.ui.stop.disabled = false;

            self.ui.wrap.dispatchEvent(evPause);
        });

        self.ui.resume.addEventListener('click', function() {
            self.ui.start.disabled = true;
            self.ui.resume.disabled = true;

            self.ui.pause.disabled = false;
            self.ui.stop.disabled = false;

            self.ui.wrap.dispatchEvent(evResume);
        });

        function handleSources() {
            let constrains = self._getSources();
            
            self._stopStreaming();
            self.stream = null;

            self.getUserMedia(constrains).then(function(stream) {
                self.stream = stream;
                self.attachStreamToSource();

                self.ui.wrap.dispatchEvent(evChange);
            });
        }

        function handleRecordMimeType() {
            let sMimeType = self.ui.selectMimeTypeFormats,
                selectedMimeType = sMimeType.options[sMimeType.selectedIndex].value;

            rec.toggleMimeType(selectedMimeType);
        }

        self.ui.selectAudioSource.addEventListener('change', handleSources);
        self.ui.selectVideoSource.addEventListener('change', handleSources);
        self.ui.selectMimeTypeFormats.addEventListener('change', handleRecordMimeType);
    },
    init: function() {
        let self = this;

        return new Promise(function(resolve, reject) {
            self.getUserMedia()
                .then(function(stream) {
                    self.stream = stream;
                    self.attachStreamToSource();
                    self.getDevices();
                    self._setupListeners();

                    resolve();
                }).catch(function(error) {
                    reject(error);
                })
        });
    }
};

/* Start !FUN */
inputCard.init()
    .then(function() {
        initRecorder();
    })
    .catch(function(error) {
        notify.show(`Error: ${error.name}`);
    });

function initRecorder() {
    let opts = {
        onstop: function onStoppedRecording(blob) {
            resultCard.blob = blob;
            resultCard.attachVideo(blob);
        },
        workerPath: inputCard.audioRecorderWorkerPath
    };

    rec = new QBMediaRecorder(opts);

    resultCard.setupListeners();

    inputCard.ui.wrap.addEventListener('started', function() {
        rec.start(inputCard.stream);
    }, false);

    inputCard.ui.wrap.addEventListener('paused', function() {
        rec.pause();
    }, false);

    inputCard.ui.wrap.addEventListener('resumed', function() {
        rec.resume();
    }, false);

    inputCard.ui.wrap.addEventListener('changed', function() {
        if (rec.getState() === 'recording') {
            rec.change(inputCard.stream);
        }
    }, false);

    inputCard.ui.wrap.addEventListener('stopped', function() {
        rec.stop();
        resultCard.toggleBtn(false);
    }, false);

    resultCard.ui.wrap.addEventListener('download', function() {
        //rec.download(null, resultCard.blob);
        let res = window.localStorage.getItem('response');
        let q = window.localStorage.getItem('survey');
        let key = res + '_' + q
        let bucket = new AWS.S3({params: {Bucket: 'mbutler'}});
        let params = {Key: key, ContentType: 'video/webm', Body: resultCard.blob};
        bucket.upload(params, function (err, data) {
            console.log(err ? 'ERROR!' : 'UPLOADED.');
        });
    }, false);
}
