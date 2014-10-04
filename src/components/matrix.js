
/**
 *  Matrix class
 */
MW.Matrix = function(nrows, ncols, mathWorkerId, nWorkersInput) {
	var that = this;
	var id = mathWorkerId || 0;
	var nWorkers = nWorkersInput || 1;
	this.nrows = nrows || 0;
	this.ncols = ncols || 0;

	var A = [];
	if (nrows > 0 && ncols > 0) {
		for (var r = 0; r < nrows; ++r) {
			A.push(new Float64Array(ncols));
		}
	}

	this.get = function(i, j) {
		return A[i][j];
	};

	this.set = function(i, j, val) {
		A[i][j] = val;
	};

	this.getRow = function(i) {
		return A[i];
	};

	this.getArray = function() {
		return A;
	};

	// B is array of Float64Arrays, like A is in the class Matrix
	this.setMatrix = function(B) {
		A = B;
		that.nrows = B.length;
		that.ncols = B[0].length;
	};

	this.isSquare = function() {
		return that.nrows == that.ncols;
	};

	this.toString = function() {
		var str = "";
		for (var i = 0; i < that.nrows; ++i) {
			var row = "[";
			for (var j = 0; j < that.ncols - 1; ++j) {
				row += A[i][j] + ", ";
			}
			str += row + A[i][that.ncols-1] + "]";
			if (i != that.nrows - 1) {
				str += "\n";
			}
		}
		return str;
	};

	this.sendToCoordinator = function(tag) {
		// only id 0 does the sending actually
		if (id == 0) {
			var matObject = {handle: "_matrixSendToCoordinator", tag: tag, nrows: that.nrows};
			var matBufferList = [];
			for (var i = 0; i < that.nrows; ++i) {
				matObject[i] = A[i].buffer;
				matBufferList.push(A[i].buffer);
			}

			self.postMessage(matObject, matBufferList);
		}
	};

	this.plus = function(B) {
		var C = new MW.Matrix(that.nrows, that.ncols);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				C.set(i, j, A[i][j] + B.get(i, j));
			}
		}
		return C;		
	};

	this.minus = function(B) {
		var C = new MW.Matrix(that.nrows, that.ncols);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				C.set(i, j, A[i][j] - B.get(i, j));
			}
		}
		return C;		
	};

	this.times = function(B) {
		var C = new MW.Matrix(that.nrows, that.ncols);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				C.set(i, j, A[i][j] * B.get(i, j));
			}
		}
		return C;		
	};

	this.dividedBy = function(B) {
		var C = new MW.Matrix(that.nrows, that.ncols);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				C.set(i, j, A[i][j] / B.get(i, j));
			}
		}
		return C;		
	};

	this.scale = function(alpha) {
		var C = new MW.Matrix(that.nrows, that.ncols);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				C.set(i, j, alpha * A[i][j]);
			}
		}
		return C;		
	};

	this.apply = function(fn) {
		var C = new MW.Matrix(that.nrows, that.ncols);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				C.set(i, j, fn(A[i][j]));
			}
		}
		return C;		
	};

	// Allocate new matrix and return to allow for arbitrary shaped matrices
	this.transpose = function() {
		var B = new MW.Matrix(that.ncols, that.nrows, that.id, that.nWorkers);
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < that.ncols; ++j) {
				B.set(j, i, A[i][j]);
			}
		}
		return B;
	};

	// Only works for square matrices
	this.transposeInPlace = function() {
		if (that.isSquare()) {
			for (var i = 0; i < that.nrows; ++i) {
				for (var j = i + 1; j < that.ncols; ++j) {
					var tmp = A[i][j];
					A[i][j] = A[j][i];
					A[j][i] = tmp;
				}
			}			
		}
		return that;
	};

	// matrix-vector multiply: A.v
	this.timesVector = function(v) {
		var w = new MW.Vector(that.nrows);
		for (var i = 0; i < that.nrows; ++i) {
			var tot = 0.0;
			for (var j = 0; j < that.ncols; ++j) {
				tot += A[i][j] * v.get(j);
			}
			w.set(i, tot);
		}
		return w;
	};

	// matrix-matrix multiply: A.B
	// TODO: if alpha is specified: alpha * A.B
	this.timesMatrix = function(B) {
		var C = new MW.Matrix(that.nrows, B.ncols, that.id, that.nWorkers);
		// Transpose B for better row-major memory access
		var Bt = B.transpose();
		for (var i = 0; i < that.nrows; ++i) {
			for (var j = 0; j < B.ncols; ++j) {
				var tot = 0.0;
				for (var k = 0; k < that.ncols; ++k) {
					tot += A[i][k] * Bt.get(j, k);
				}
				C.set(i, j, tot);
			}
		}
		return C;
	};

	this.wkPlus = function(B, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(that.ncols));
			for (var j = 0; j < that.ncols; ++j) {
				C[offset][j] = A[i][j] + B.get(i, j);
			}
			++offset;
		}
		MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};

	this.wkMinus = function(B, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(that.ncols));
			for (var j = 0; j < that.ncols; ++j) {
				C[offset][j] = A[i][j] - B.get(i, j);
			}
			++offset;
		}
        MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};

	this.wkTimes = function(B, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(that.ncols));
			for (var j = 0; j < that.ncols; ++j) {
				C[offset][j] = A[i][j] * B.get(i, j);
			}
			++offset;
		}
        MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};

	this.wkDividedBy = function(B, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(that.ncols));
			for (var j = 0; j < that.ncols; ++j) {
				C[offset][j] = A[i][j] / B.get(i, j);
			}
			++offset;
		}
        MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};

	this.wkScale = function(alpha, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(that.ncols));
			for (var j = 0; j < that.ncols; ++j) {
				C[offset][j] = alpha * A[i][j];
			}
			++offset;
		}
        MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};

	this.wkApply = function(fn, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(that.ncols));
			for (var j = 0; j < that.ncols; ++j) {
				C[offset][j] = fn(A[i][j]);
			}
			++offset;
		}
        MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};

	// matrix-vector multiply: A.v
	this.wkTimesVector = function(v, tag, rebroadcast) {
		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var w = new Float64Array(lb.ito - lb.ifrom);
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			var tot = 0.0;
			for (var j = 0; j < that.ncols; ++j) {
				tot += A[i][j] * v.get(j);
			}
			w[offset++] = tot;
		}
        MW.MathWorker.gatherVector(w, tag, id, rebroadcast);
	};

	// C = A.B
	this.wkTimesMatrix = function(B, tag, rebroadcast) {
		// Transpose B for better row-major memory access
		// If square, save on memory by doing an in-place transpose
		var Bt = B.isSquare() ? B.transposeInPlace() : B.transpose();

		var lb = util.loadBalance(that.nrows, nWorkers, id);
		var C = [];
		var offset = 0;
		for (var i = lb.ifrom; i < lb.ito; ++i) {
			C.push(new Float64Array(B.ncols));
			for (var j = 0; j < B.ncols; ++j) {
				var tot = 0.0;
				for (var k = 0; k < that.ncols; ++k) {
					tot += A[i][k] * Bt.get(j, k);
				}
				C[offset][j] = tot;
			}
			++offset;
		}

		// restore B
		if (B.isSquare) {
			B.transposeInPlace();
		}

        MW.MathWorker.gatherMatrix(C, lb.ifrom, tag, id, rebroadcast);
	};
};

MW.Matrix.fromArray = function(arr, mathWorkerId, nWorkersInput) {
	var mat = new MW.Matrix(arr.length, arr[0].length, mathWorkerId, nWorkersInput);
	for (var i = 0; i < arr.length; ++i) {
		for (var j = 0; j < arr[i].length; ++j) {
			mat.set(i, j, arr[i][j]);
		}
	}
	return mat;
};


