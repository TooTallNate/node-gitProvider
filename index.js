var fs = require('fs');
var url = require('url');
var path = require('path');
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
    next = next || function(err) { res.writeHead(err ? 500 : 404); res.end(err ? err.stack : "Not Found"); };

    if (!req.hasOwnProperty("uri")) { req.uri = url.parse(req.url); }
    if (req.uri.pathname.substring(0, options.mountPoint.length) !== options.mountPoint) return next();

    var gitPath = req.uri.pathname.substring(options.mountPoint.length);
    //console.log(gitPath);

    var parts = gitPath.split('/');
    if (parts[parts.length-1].length === 0) {
      parts[parts.length-1] = options.indexFile;
    }
    //console.log(parts);

    // The first part may be a commit reference, a git tag name, or just simply
    // the name of the file to serve from a top-level.
    var firstPart = parts[0];
    if (firstPart.length === 40) {
      // Check the commit id, then git tag, then serve file
      checkCommit(firstPart);
    } else {
      // Check for a git tag, then serve file
      checkTag(firstPart);
    }

    function checkCommit(commitRef) {
      console.log(commitRef);
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
        commit.getTree(function(err, tree) {
          serveGitFile(repo, tree, parts.slice(1), res, next);
        });
      });
    }
    function checkTag(tag) {
      listTags(repo, function(err, tags) {
        if (err) return next(err);

        var tagIndex = tags.indexOf(firstPart);
        if (tagIndex >= 0) {
          // Requested a file from a git tag. Resolve the git tag then serve the file from parts[1]
          resolveTag(repo, tag, function(err, commitRef) {
            if (err) return next(err);
            serveCommit(commitRef, parts.slice(1));
          });
        } else {
          // No git tag, all the parts are the path of the file to server.
          // Serve from HEAD (bare repo) or a real file (cloned repo).
          if (isClone) {
            fs.readFile(path.join(repoPath, '..', parts.join('/')), function(err, buf) {
              if (err) {
                if (err.code === 'ENOENT') return next();
                else return next(err);
              }
              serveBuffer(buf, res);
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
        commit.getTree(function(err, tree) {
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
  var thisPart = parts.shift();
  var isLastPart = parts.length === 0;
  tree.getEntry(thisPart, function(err, entry) {
    if (err) return next(err);
    if (isLastPart) {
      repo.getRawObject(entry.id, function(err, buf) {
        if (err) return next(err);
        if (!buf.data) return next();
        serveBuffer(buf.data, res);
      });
    } else {
      repo.getTree(entry.id, function(err, entryTree) {
        if (err) return next(err);
        serveGitFile(repo, entryTree, parts, res, next);
      });
    }
  });
}


function serveBuffer(buf, res) {
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}


function resolveHead(repo, callback) {
  fs.readFile(path.join(repo.path, 'refs', 'heads', 'master'), function(err, commit) {
    if (err) return callback(err);
    callback(null, commit.toString().trim());
  });
}


function resolveTag(repo, tag, callback) {
  fs.readFile(path.join(repo.path, 'refs', 'tags', tag), function(err, commit) {
    if (err) return callback(err);
    callback(null, commit.toString().trim());
  });
}


function listTags(repo, callback) {
  fs.readdir(path.join(repo.path, 'refs', 'tags'), callback);
}
