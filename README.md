node-gitProvider
========
### An http/connect/stack layer to serve the contents of a 'git' repository over HTTP.


This module offers the ability to serve the contents of a 'git' repo over HTTP, with
the option to retreive files from specific commits or tags if desired.

If a working directory exists in the repo, then it's contents will be served if no
commit is explicitly specified. If it's a bare repo, then the _HEAD_ commit will be
served when no commit is specified.


Usage
-----

The only required argument is the path to a git repository that you would like to serve.

    var http = require('http');
    var gitProvider = require('gitProvider');

    var server = http.createServer(
      gitProvider(process.env.HOME + '/someRepo')
    );

The barebones example above will create a git provider with the default options
and will serve the git repo located a "~/someRepo".

So let's assume that "someRepo" simply contains an `index.html` file and a few commits
that modify that file. With the example server above running, we can send simple HTTP
requests to retreive the contents of that file, in a few different ways:

    curl http://127.0.0.1/index.html

The above command gets `index.html` from the current _HEAD_ commit of the repo (if it's
a bare repo), or the file from the git working directory if it's a regular repo.

    curl http://127.0.0.1/f62de2f138dd241256d1cd0be10d52f671e68d2f/index.html

Now the above command gets `index.html` from the specified commit: _f62de2f138dd241256d1cd0be10d52f671e68d2f_.

    curl http://127.0.0.1/v1.1.2/index.html

`git tag`s can also be specified in place of specific commit revisions. Here _v1.1.2_ would be
a git tag to reference `index.html` from.


API
---

### gitProvider(repoPath [, options]) -> handler

The `gitProvider` function only requires a path to a git repo. Optionally, you may
pass an _options_ object that recognizes the following properties:

  * __mountPoint__: The request URL in which this handler will kick in. If the request
   URL does not begin with the value set here, the the request will be
   `next()`'d. (Default `/`, i.e. will always take effect).

  * __indexFile__: The name of the index file to serve if a directory name is specified.
   (Default `index.html`).


[Node]: http://nodejs.org
