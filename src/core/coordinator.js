// Copyright 2014 Adrian W. Lange

/**
 *  Coordinator for browser-side interface
 */
MW.Coordinator = function(nWorkersInput, workerScriptName) {
	var that = this;
	var objectBuffer = {};
	var messageDataBuffer = [];
	this.ready = false;

	// Create the worker pool, which starts the workers
	global.createPool(nWorkersInput, workerScriptName);

	this.getBuffer = function() {
		return objectBuffer;
	};

	this.getMessageDataList = function() {
		return messageDataBuffer;
	};

	this.trigger = function(tag, args) {
		for (var wk = 0; wk < global.nWorkers; ++wk) {
			global.getWorker(wk).postMessage({handle: "_trigger", tag: tag, args: args});
		}
	};

	this.sendDataToWorkers = function(dat, tag) {
		for (var wk = 0; wk < global.nWorkers; ++wk) {
			global.getWorker(wk).postMessage({handle: "_broadcastData", tag: tag, data: dat});
		}
	};

	this.sendVectorToWorkers = function(vec, tag) {
		// Must make a copy of the vector for each worker for transferable object message passing
		for (var wk = 0; wk < global.nWorkers; ++wk) {
			var v = new Float64Array(vec.array);
			global.getWorker(wk).postMessage({handle: "_broadcastVector", tag: tag,
				vec: v.buffer}, [v.buffer]);
		}
	};

	this.sendMatrixToWorkers = function(mat, tag) {
		// Must make a copy of each matrix row for each worker for transferable object message passing
		for (var wk = 0; wk < global.nWorkers; ++wk) {
			var matObject = {handle: "_broadcastMatrix", tag: tag, nrows: mat.nrows};
			var matBufferList = [];
			for (var i = 0; i < mat.nrows; ++i) {
				var row = new Float64Array(mat.array[i]);
				matObject[i] = row.buffer;
				matBufferList.push(row.buffer);
			}
			global.getWorker(wk).postMessage(matObject, matBufferList);
		}
	};

    // Convenience on ready to hide the handle
    this.onReady = function(callBack) {
        this.on("_ready", callBack);
    };

	// Route the message appropriately for the Worker
 	var onmessageHandler = function(event) {
 		var data = event.data;
 		switch (data.handle) {
 			case "_workerReady":
 				handleWorkerReady();
 				break;
 			case "_sendData":
 				handleSendData(data);
 				break;
 			case "_vectorSendToCoordinator":
 				handleVectorSendToCoordinator(data);
 				break;
 			case "_gatherVector":
 				handleGatherVector(data);
 				break;
 			case "_matrixSendToCoordinator":
 				handleMatrixSendToCoordinator(data);
 				break;
 			 case "_gatherMatrixRows":
 				handleGatherMatrixRows(data);
 				break;
            case "_gatherMatrixColumns":
                handleGatherMatrixColumns(data);
                break;
  			case "_vectorSum":
 				handleVectorSum(data);
 				break;
            case "_vectorProduct":
                handleVectorProduct(data);
                break;
 			default:
 				console.error("Invalid Coordinator handle: " + data.handle);
 		}
 	};

 	// Register the above onmessageHandler for each worker in the pool
 	// Also, initialize the message data buffer with empty objects
 	for (var wk = 0; wk < global.nWorkers; ++wk) {
 		global.getWorker(wk).onmessage = onmessageHandler;
 		messageDataBuffer.push({});
 	}

 	// Reduction function variables
 	var nWorkersReported = 0;

 	var handleWorkerReady = function() {
 		nWorkersReported += 1;
 		if (nWorkersReported == global.nWorkers) {
 			that.ready = true;
 			that.emit("_ready");
 			// reset for next message
			nWorkersReported = 0;	
 		}
 	};

 	var handleSendData = function(data) {
 		messageDataBuffer[data.id] = data.data;
 		nWorkersReported += 1;
 		if (nWorkersReported == global.nWorkers) {
 			that.emit(data.tag);
 			// reset for next message
			nWorkersReported = 0;	
 		}
 	};

	var handleVectorSendToCoordinator = function(data) {
		objectBuffer = new MW.Vector();
		objectBuffer.setVector(new Float64Array(data.vectorBuffer));
		that.emit(data.tag);
	};

	var handleMatrixSendToCoordinator = function(data) {
        var tmp = [];
		for (var i = 0; i < data.nrows; ++i) {
			tmp.push(new Float64Array(data[i]));
		}
		objectBuffer = new MW.Matrix();
		objectBuffer.setMatrix(tmp);
		that.emit(data.tag);
	};

	var handleGatherVector = function(data) {
		// Gather the vector parts from each worker
        if (nWorkersReported == 0) {
            objectBuffer = new MW.Vector(data.len);
        }
        var tmpArray = new Float64Array(data.vectorPart);
        var offset = data.offset;
        for (var i = 0; i < tmpArray.length; ++i) {
            objectBuffer.array[offset + i] = tmpArray[i];
        }

		nWorkersReported += 1;
		if (nWorkersReported == global.nWorkers) {
			if (data.rebroadcast) {
				that.sendVectorToWorkers(objectBuffer, data.tag);
			} else {
				// emit
				that.emit(data.tag);
			}
			// reset
			nWorkersReported = 0;
		}
	};

	var handleGatherMatrixRows = function(data) {
		// Gather the matrix rows from each worker
        var offset = data.offset;
        if (nWorkersReported == 0) {
            objectBuffer = new MW.Matrix(data.nrows, data.ncols);
        }
        for (var i = 0; i < data.nrowsPart; ++i) {
			objectBuffer.array[offset + i] = new Float64Array(data[i]);
		}

		nWorkersReported += 1;
		if (nWorkersReported == global.nWorkers) {
			// build the full vector and save to buffer
			if (data.rebroadcast) {
				that.sendMatrixToWorkers(objectBuffer, data.tag);
			} else {
				// emit
				that.emit(data.tag);
			}
			//reset
			nWorkersReported = 0;
		}
	};

    var handleGatherMatrixColumns = function(data) {
        // Gather the matrix columns from each worker
        var i, k;
        if (nWorkersReported == 0) {
            objectBuffer = new MW.Matrix(data.nrows, data.ncols);
        }

        // array in data is transposed
        var tmpArray;
        var offsetk;
        for (k = 0, offsetk = data.offset; k < data.nrowsPart; ++k, ++offsetk) {
            tmpArray = new Float64Array(data[k]);
            for (i = 0; i < tmpArray.length; ++i) {
                objectBuffer.array[i][offsetk] = tmpArray[i];
            }
        }

        nWorkersReported += 1;
        if (nWorkersReported == global.nWorkers) {
            if (data.rebroadcast) {
                that.sendMatrixToWorkers(objectBuffer, data.tag);
            } else {
                // emit
                that.emit(data.tag);
            }
            //reset
            nWorkersReported = 0;
        }
    };

    var handleVectorSum = function(data) {
        if (nWorkersReported == 0) {
            objectBuffer = data.tot;
        } else {
            objectBuffer += data.tot;
        }
        nWorkersReported += 1;
        if (nWorkersReported == global.nWorkers) {
            if (data.rebroadcast) {
                // rebroadcast the result back to the workers
                that.sendDataToWorkers(objectBuffer, data.tag);
            } else {
                // save result to buffer and emit to the browser-side coordinator
                that.emit(data.tag);
            }
            // reset for next message
            nWorkersReported = 0;
        }
    };

	var handleVectorProduct = function(data) {
        if (nWorkersReported == 0) {
            objectBuffer = data.tot;
        } else {
            objectBuffer *= data.tot;
        }
		nWorkersReported += 1;
		if (nWorkersReported == global.nWorkers) {
			if (data.rebroadcast) {
				// rebroadcast the result back to the workers
				that.sendDataToWorkers(objectBuffer, data.tag);
			} else {
				// save result to buffer and emit to the browser-side coordinator
				that.emit(data.tag);
			}
			// reset for next message
			nWorkersReported = 0;
		}
	};

};
MW.Coordinator.prototype = new EventEmitter();
