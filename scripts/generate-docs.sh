#!/bin/bash

# Copyright 2018 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Regenerates the docs for MuseAIKit package
# Usage: yarn docs

set -euo pipefail

# Directory variables
tmpDir=/tmp/museaikit_docs
currBranch=$(git rev-parse --abbrev-ref HEAD)
currDir=$(pwd)
baseDir=$(git rev-parse --show-toplevel)

# Generation variables
urlPrefix="https://github.com/flufy3d/MuseAIKit/tree/master/src/"
keepAfter="/src/"

# Parse exports from index.ts
exports=$(sed -n "s/export \* from '.\/\(.*\)';/\1/p" $currDir/src/index.ts)
scriptToFixTheToc="<script>
const toc = \"$exports\".split(' ');
const links = document.querySelectorAll('.tsd-kind-external-module');
for (let i = 0; i < links.length; i++) {
  const name = links[i].textContent.trim().replace(/\"/g, '');
  if (toc.indexOf(name) === -1) {
    links[i].parentNode.removeChild(links[i]);
  }
}
</script>"

# Generate the docs
rm -rf $tmpDir
npx typedoc --options typedoc.json src --out $tmpDir

# Fix the index.html
echo $scriptToFixTheToc >> $tmpDir/index.html

# Fix source file links
allFiles=$(find $tmpDir -type f -name '*.html')
for path in $allFiles; do
  filename=$(basename $path .html)

  # Fix "Defined in" links
  if grep -Fq "Defined in" $path; then
    search="href=\".*${keepAfter}\(.*\)\""
    replace="href=\"${urlPrefix}\1\""
    sed -i "" "s%${search}%${replace}%g" $path
  fi

  # Fix leaked local paths
  if grep -Fq "Users" $path; then
    path1=$(expr "$filename" : '_\(.*\)_.*_')  # core
    path2=$(expr "$filename" : '_.*_\(.*\)_.*')  # chords
    correct_source_file=$path1/$path2.ts

    # Replace path in href
    search="src//Users/.*\">"
    replace="src/${correct_source_file}\">"
    sed -i "" "s%${search}%${replace}%g" $path

    # Replace path in text content
    search=">/Users.*</a>"
    replace=">${correct_source_file}</a>"
    sed -i "" "s%${search}%${replace}%g" $path
  fi
done

# Switch to gh-pages and update docs
git checkout gh-pages
git fetch origin
git reset --hard origin/gh-pages

cd $baseDir
git rm -fr docs --quiet
mkdir -p docs
rsync -a $tmpDir/ docs/
git add docs
currDate=$(date)
git commit -m "📖 Updating docs: $currDate"
git push

# Switch back to original branch
git checkout $currBranch
cd $currDir
