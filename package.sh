set -x
EPATH=/home/tinmar/Dev/raspestrio/androidjs/serverdist

rm -rf $EPATH
mkdir $EPATH
# rm -r node_modules
npm run buildForAndroid
cp -r ../view-dist $EPATH

cp package.json $EPATH
cp package-lock.json $EPATH
cp -r node_modules $EPATH
cd $EPATH
npm prune --production
# pnpm i --prod
npm install --only=prod
rm package.json
# cp -r ./dist/android/* $EPATH
# cp -r ./node_modules $EPATH
