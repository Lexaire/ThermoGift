import { registerWorker } from "./common/worker-shell.js";
import thermometers from "./puzzles/thermometers/index.js";
import tents from "./puzzles/tents/index.js";

registerWorker({ thermometers, tents });
