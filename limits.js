;(function(ctx) {

    var RANGES = {
        secondly: 1000,
        minutely: 60000,
        quarterly: 900000,
        hourly: 3600000,
        daily: 86400000,
        weekly: 604800000
    };

    // Construct a new RuleChain
    var RuleChain = function(opts) {
        this.options = opts || {};

        this.track = this.options.history || [];
        this.rules = [];

        for (var name in RANGES) {
            if (!RANGES.hasOwnProperty(name)) continue;
            if (name in this.options) this[name](this.options[name]);
        }
    };

    // Determ when the next call can be made.
    // This returns an value in milliseconds
    RuleChain.prototype.whensNext = function() {
        return this._process().delay;
    };

    // Push a function into the call stack.
    // Optionally a second conditional function
    // can get passed in. This functions gets an 'delay'
    // parameter passed in as first argument which indicates
    // after how much milliseconds fn will get called.
    // Returning false in the conditional function prevent
    // fn from being added to the call stack.
    RuleChain.prototype.push = function(fn, cond) {
        var delay = this.whensNext(),
            that = this;

        if (!this.rules.length) {
            throw {
                name: 'RuleError',
                message: 'there are no defined rules'
            };
        }

        if (typeof cond === 'function' && cond(delay) === false) {
            return false;
        }

        this.track.push(Date.now() + delay);

        return {
            delay: delay,
            timer: setTimeout(function() {
                // Call the 'onCall' Callback if an entry
                // gets added to the history.
                if (typeof that.options.onCall === 'function') {
                    that.options.onCall(delay);
                }
                fn();
            }, delay)
        };
    };

    // Run through all buckets and determ when
    // the next call can be made. Each Bucket
    // also returns also an 'spliceIdx'.
    // The spliceIdx identicates from which index
    // on the track array can be saftely cleared,
    RuleChain.prototype._process = function() {
        var est = (function(memo, rules, track) {
            var now = Date.now();

            for (var i = 0, len = rules.length; i < len; i++) {
                (function(fn) {
                    var comp = fn(now, track);
                    if (memo.delay < comp.delay) {
                        memo.delay = comp.delay
                    }

                    if (!('spliceIdx' in memo) || memo.spliceIdx > comp.spliceIdx) {
                        memo.spliceIdx = comp.spliceIdx
                    }
                })(rules[i]);
            }

            return memo;
        })({
            delay: 0
        }, this.rules, this.track);

        if (('spliceIdx' in est) && est.spliceIdx > 0) {
            if (typeof this.options.onClear === 'function') {
                this.options.onClear(this.track[est.spliceIdx]);
            }
            this.track.splice(0, est.spliceIdx);
        }

        return est;
    };

    // inspired by _.sortedIndex
    // find the position in the sorted
    // array 'this.track' where 'val'
    // could be inserted
    RuleChain.prototype._bsearch = function(val) {
        var low = 0, high = this.track.length;
        while (low < high) {
            var mid = (low + high) >>> 1;
            this.track[mid] < val ? low = mid + 1 : high = mid;
        }
        return low;
    };

    // Register a new rule which indicates that within
    // a period of 'millis' only a certain amount
    // of 'maxcalls' can be made.
    RuleChain.prototype.within = function(millis, maxcalls) {
        var that = this;

        this.register(function(now, track) {
            var past = now - millis,
                idx = that._bsearch(past),
                rest = track.length - idx,
                delay = (rest >= maxcalls) ? (track[idx + (rest - maxcalls)] + millis) - now : 0;
            return {
                delay: delay,
                spliceIdx: idx
            };
        });

        return this;
    };

    // Create some methods out of our RANGES Object
    for (var name in RANGES) {
        if (!RANGES.hasOwnProperty(name)) continue;
        (function(name, millis) {
            RuleChain.prototype[name] = function(maxcalls) {
                return this.within(millis, maxcalls);
            }
        })(name, RANGES[name]);
    }

    // Register a custom rule.
    // fn gets two arguments passed in:
    // 'now', which is a timestamp and
    // 'tracks', which is an array history and
    // future calls.
    RuleChain.prototype.register = function(fn) {
        this.rules.push(fn);
        return this;
    };

    // This is basicly just a factory
    // to create new RuleChains
    var limits = function(opts) {
        return new RuleChain(opts);
    };

    limits.RuleChain = RuleChain;

    // Node.js / browserify
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = limits;
    }
    // AMD
    else if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return limits;
        });
    }
    // <script>
    else {
        ctx.limits = limits;
    }

})(this);