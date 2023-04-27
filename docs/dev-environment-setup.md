To run your local dev environment you will need a few things on your machine. Follow the steps below.

## Installations

- Install [Node JS](https://nodejs.org/en/download/), version `16.x`

- Install an IDE (preferably [VS Code](https://code.visualstudio.com/))

- Install Git (if you don't already have it on your machine).
  <br/>

## Getting the sources

Clone the repository locally:

```
git clone https://github.com/aircarbon/stm-v2
```

## Build

- Within the repository directory, run `yarn dev:setup` to install the project's dependencies.

- Then, build the project by running `yarn dev:build`.

Here's what `yarn build` doing behind the scenes:

<br/>

<!-- NOTE-swimm-snippet: the lines below link your snippet to Swimm -->

### 📄 package.json

```json
12    "dev:build": "cd orm && npm run build",
13    "dev:setup": "yarn install && cd sol && yarn install",
```

<br/>

## Congrats

You now have your dev environment ready 🎉

<br/>
