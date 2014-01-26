var test = require('tape');
var factor = require('../');
var mdeps = require('module-deps');
var through = require('through');
var path = require('path');
var fs = require('fs');
var pack = require('browser-pack');
var concat = require('concat-stream');
var vm = require('vm');

test('more complicated dependencies', function (t) {
    //t.plan(5);
    t.plan(2);
    var files = [ 'x.js', 'y.js' ].map(function (file) {
      return path.join(__dirname, 'files', file);
    });

    var expected = {
        common: [ read('z.js') ],
        'x.js': [
            read('x.js', {
                entry: true,
                deps: { './z.js': norm('z.js'), './w.js': norm('w.js') }
            }),
            read('w.js')
        ],
        'y.js': [
            read('y.js', {
               entry: true,
               deps: { './z.js': norm('z.js') }
            })
        ]
    };
    
    var packs = {
        common: pack({ raw: true }),
        'x.js': pack({ raw: true }),
        'y.js': pack({ raw: true })
    };
    
    var pending = 3;
    
    var sources = {};
    packs.common.pipe(concat(function (src) {
        sources.common = src;
        done();
    }));
    packs['x.js'].pipe(concat(function (src) {
        sources['x.js'] = src;
        done();
    }));
    packs['y.js'].pipe(concat(function (src) {
        sources['y.js'] = src;
        done();
    }));
    
    function done () {
        if (--pending !== 0) return;
        var srcx = 'require=' + sources.common
            + ';require=' + sources['x.js']
        ;
        function logx (msg) { t.equal(msg, 55500) }
        vm.runInNewContext(srcx, { console: { log: logx } });
        
        var srcy = 'require=' + sources.common
            + ';require=' + sources['y.js']
        ;
        function logy (msg) { t.equal(msg, 333) }
        vm.runInNewContext(srcy, { console: { log: logy } });
    }
    
    var rows = [];
    var fr = factor(files, { objectMode: true, raw: true });
    fr.on('stream', function (bundle) {
        var name = path.basename(bundle.file);
        bundle.pipe(rowsOf(function (rows) {
            //t.deepEqual(rows, expected[name]);
        }));
        bundle.pipe(packs[name]);
    });
    mdeps(files).pipe(fr)
    fr.pipe(rowsOf(function (rows) {
        //t.deepEqual(rows, expected.common);
    }));
    fr.pipe(packs.common);
});

test('same module included twice', function (t) {
    //t.plan(5);
    t.plan(3);

    var files = [ 't.js' ].map(function (file) {
        return path.join(__dirname, 'files', file);
    });

    var expected = {
        common: [],
        't.js': [
            read('t.js', {
                entry: true,
                deps: { './a.js': norm('a.js'), './w.js': norm('w.js') }
            }),
            read('a.js'),
            read('w.js', {
                deps: { './a.js': norm('a.js') }
            })
        ]
    };

    var packs = {
        common: pack({ raw: true }),
        't.js': pack({ raw: true })
    };

    var pending = 2;

    var sources = {};
    packs.common.pipe(concat(function (src) {
        sources.common = src;
        done();
    }));
    packs['t.js'].pipe(concat(function (src) {
        sources['t.js'] = src;
        done();
    }));

    function done () {
        if (--pending !== 0) return;
        var srct = 'require=' + sources.common
            + ';require=' + sources['t.js']
        ;
        function logx (msg) { t.equal(msg, 300) }
        vm.runInNewContext(srct, { console: { log: logx } });
    }

    var rows = [];
    var fr = factor(files, { objectMode: true, raw: true });
    fr.on('stream', function (bundle) {
        var name = path.basename(bundle.file);
        bundle.pipe(rowsOf(function (rows) {
            t.deepEqual(rows, expected[name]);
        }));
        bundle.pipe(packs[name]);
    });
    mdeps(files).pipe(fr)
    fr.pipe(rowsOf(function (rows) {
        t.deepEqual(rows, expected.common);
    }));
    fr.pipe(packs.common);
});

function rowsOf (cb) {
    var rows = [];
    return through(write, end);
    
    function write (row) { rows.push(row) }
    function end () { cb(rows) }
}

function read (name, ref) {
    if (!ref) ref = {};
    var file = norm(name);
    ref.id = file;
    ref.source = fs.readFileSync(file, 'utf8');
    if (!ref.deps) ref.deps = {};
    return ref;
}

function norm (file) {
    return path.normalize(__dirname + '/files/' + file);
}