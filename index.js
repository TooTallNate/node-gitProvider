var fs = require('fs');
var url = require('url');
var path = require('path');
var mime = require('mime');
var gitteh = require('gitteh');

var GIT_DIR = '.git';

function setup(repoPath, options) {
  options = options || {};
  options.__proto__ = setup.DEFAULTS;

  // 'setup' can be synchronous...
  var isClone;
  try {
    isClone = fs.statSync(path.join(repoPath, GIT_DIR)).isDirectory();
  } catch(e) {
    if (e.code === 'ENOENT') {
      isClone = false;
    } else {
      throw e;
    }
  }
  if (isClone && repoPath.substring(repoPath.length-4) !== GIT_DIR) repoPath = path.join(repoPath, GIT_DIR);
  //console.log("Using repository:", repoPath, "isClone:", isClone);
  // Synchronously open the git repo
  var repo = gitteh.openRepository(repoPath);

  return function gitProvider(req, res, next) {
    // Ensure that 'next()' exists (in the case of a plain http.Server)
    next = next || function(err) {
      if (err) console.error(err);
      res.writeHead(err ? 500 : 404);
      res.end(err ? err.stack : "Not Found");
    };

    if (!req.hasOwnProperty("uri")) { req.uri = url.parse(req.url); }
    if (req.uri.pathname.substring(0, options.mountPoint.length) !== options.mountPoint) return next();

    var gitPath = req.uri.pathname.substring(options.mountPoint.length);

    var parts = gitPath.split('/');
    if (parts[parts.length-1].length === 0) {
      parts[parts.length-1] = options.indexFile;
    }

    // The first part may be a commit reference, a git tag/branch name,
    // or just simply the name of the file to serve from a top-level.
    var firstPart = parts[0];
    //console.log("First Part: " + firstPart);

    if (firstPart.length === 40) {
      // Check the commit id, then git tag, then serve file
      checkCommit(firstPart);
    } else {
      // Check for a git tag, then serve file
      checkTag(firstPart);
    }

    function checkCommit(commitRef) {
      repo.getCommit(commitRef, function(err, commit) {
        if (err) {
          if (err.gitError === gitteh.error.GIT_ENOTFOUND) {
            // first part isn't a git commit, next check for a git tag
            return checkTag(commitRef);
          } else {
            // Some other kind of error, baaddd!
            return next(err);
          }
        }
        // If there was no error then we got a valid commit id. Serve the file from parts[1]
        repo.getTree(commit.tree, function(err, tree) {
          serveGitFile(repo, tree, parts.slice(1), res, next);
        });
      });
    }
    function checkTag(tag) {
      listTags(repo, function(err, tags) {
        if (err) return next(err);

        //console.log("Tags: " + tags);

        var tagIndex = tags.indexOf(firstPart);
        if (tagIndex >= 0) {
          //console.log("Found tag: " + tags[tagIndex]);

          // Requested a file from a git tag. Resolve the git tag then serve the file from parts[1]
          resolveTag(repo, tag, function(err, commitRef) {
            if (err) return next(err);
            serveCommit(commitRef, parts.slice(1));
          });
        } else {
          //console.log("Tag not found");
          // No git tag, all the parts are the path of the file to server.
          // Serve from HEAD (bare repo) or a real file (cloned repo).
          if (isClone) {
            fs.readFile(path.join(repoPath, '..', parts.join('/')), function(err, buf) {
              if (err) {
                if (err.code === 'ENOENT') return next();
                else return next(err);
              }
              serveBuffer(buf, res, gitPath);
            });
          } else {
            // Is a bare repo, serve file from resolved HEAD
            resolveHead(repo, function(err, commitRef) {
              if (err) return next(err);
              serveCommit(commitRef, parts);
            });
          }
        }
      });
    }

    function serveCommit(commitRef, parts) {
      repo.getCommit(commitRef, function(err, commit) {
        if (err) return next(err);
        repo.getTree(commit.tree, function(err, tree) {
          if (err) return next(err);
          serveGitFile(repo, tree, parts, res, next);
        });
      });
    }
  }
}
module.exports = setup;

setup.DEFAULTS = {
  // The base request URL to serve from
  mountPoint: '/',
  // The name of the index file to serve when
  // a directory name is requested
  indexFile: 'index.html'
};


// Returns a Buffer of the specified file from the specified repo and commit reference.
// Recursively gets the tree instances until the last part, which is gets the rawObject
// for and serves back over HTTP.
function serveGitFile(repo, tree, parts, res, next) {
  //console.log("Serving git file: " + parts);
  var thisPart = parts.shift();
  var isLastPart = parts.length === 0;
  var entryIndex = -1;
  for (var i=0; i < tree.entries.length; i++) {
    if (tree.entries[i].name === thisPart) {
      entryIndex = i;
      break;
    }
  }
  if (entryIndex < 0) return next();
  var entry = tree.entries[entryIndex];
  if (isLastPart) {
    repo.getBlob(entry.id, function(err, buf) {
      if (err) return next(err);
      if (!buf.data) return next();
      serveBuffer(buf.data, res, parts.join('/'));
    });
  } else {
    repo.getTree(entry.id, function(err, entryTree) {
      if (err) return next(err);
      serveGitFile(repo, entryTree, parts, res, next);
    });
  }
}


function serveBuffer(buf, res, filename) {
  var contentType = mime.lookup(filename);
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Content-Type', contentType);
  res.end(buf);
}


function resolveReference(repo, reference, callback) {
  repo.getReference(reference, onRef);
  function onRef(err, ref) {
    if (err) return callback(err);
    if (ref.type === gitteh.GIT_REF_OID) {
      callback(null, ref.target);
    } else if (ref.type === gitteh.GIT_REF_SYMBOLIC) {
      ref.resolve(onRef);
    } else {
      callback(new Error('Got unknown reference type: ' + ref.type));
    }
  }
}


function resolveHead(repo, callback) {
  resolveReference(repo, 'HEAD', callback);
}

var TAG_REF = 'refs/tags/';
function resolveTag(repo, tag, callback) {
  resolveReference(repo, TAG_REF+tag, callback);
}


function listTags(repo, callback) {
  repo.listReferences(gitteh.GIT_REF_LISTALL, onList);
  function onList(err, refs) {
    if (err) return callback(err);
    refs = refs.filter(function(ref) { return /^refs\/tags\//.test(ref); });
    refs = refs.map(function(ref) { return ref.substring(TAG_REF.length); });
    callback(null, refs);
  }
}
