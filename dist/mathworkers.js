(function() {
"use strict";

/**
 * The MathWorkers namespace that everything hangs off of
 *
 * @namespace MathWorkers
 */
var MathWorkers = {};


(function(){

    MathWorkers.Communication = function() {

        this.postMessageToWorker = function(worker, data, buffer) {
            worker.postMessage(data, buffer);
        };

        this.setOnMessage = function(worker, handler) {
            worker.onmessage = handler;
        }
    };

    MathWorkers.comm = new MathWorkers.Communication();

}());



(function(){

    var that;

    var Coordinator = function(nWorkersInput, workerFilePath) {
        that = this;

        this.nWorkers = nWorkersInput;
        this.workerPool = [];

        // Create the worker pool
        for (var i = 0; i < nWorkersInput; i++) {
            var worker = new Worker(workerFilePath);
            MathWorkers.comm.setOnMessage(worker, onmessageHandler);
            MathWorkers.comm.postMessageToWorker(worker, {handle: "_init", id: i});
            this.workerPool.push(worker);
        }
    };

    var objectBuffer = {};

    var onmessageHandler = function(event) {
        var data = event.data || event;
        switch (data.handle) {
            case "_sendCoordinatorData":
                return Coordinator.handleSendCoordinatorData(data);
            default:
                console.error("Invalid worker communication handle: " + data);
        }
    };

    Coordinator.handleSendCoordinatorData = function(data) {
        objectBuffer = data;
        console.log("Coordinator got data: " + data);
    };

    MathWorkers.Coordinator = Coordinator;

}());


if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    // Exporting for node.js
    module.exports = MathWorkers;
} else if (typeof window !== 'undefined') {
    // Exporting for browser
    window.MathWorkers = MathWorkers;
} else {
    // Exporting for web worker
    self.MathWorkers = MathWorkers;
}

})();
