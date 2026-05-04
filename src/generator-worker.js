import { registerWorker } from "./common/worker-shell.js";
import thermometers from "./puzzles/thermometers/index.js";

registerWorker({ thermometers });
