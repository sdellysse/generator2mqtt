import Mqtt from "async-mqtt";
import { log, wait } from "./utils";

process.env.MQTT_URL = "tcp://debian.lan:1883";
process.env.MQTT_PREFIX = "generator2mqtt";

const stateInTopics = <const>[
  `esphome/generator-plug/status`,
  `esphome/generator-plug/voltage`,
  `esphome/generator-plug/wattage`,
];
type StateInTopic = typeof stateInTopics[number];

const mappings = {
  "sensor.generator_state": {
    domain: "sensor",
    config: {
      device: {
        identifiers: ["predator3500"],
        manufacturer: "Harbor Freight",
        model: "Predator 3500",
        name: "Generator",
      },
    },
    name: "Generator State",
    unique_id: "generator_state",
  },
  "sensor.generator_voltage": {
    domain: "sensor",
    config: {
      device: {
        identifiers: ["predator3500"],
        manufacturer: "Harbor Freight",
        model: "Predator 3500",
        name: "Generator",
      },
      device_class: "voltage",
      entity_category: "diagnostic",
      state_class: "measurement",
      unit_of_measurement: "V",
    },
    name: "Generator Voltage",
    unique_id: "generator_voltage",
  },
  "sensor.generator_fan_wattage": {
    domain: "sensor",
    config: {
      device: {
        identifiers: ["predator3500"],
        manufacturer: "Harbor Freight",
        model: "Predator 3500",
        name: "Generator",
      },
      device_class: "power",
      entity_category: "diagnostic",
      state_class: "measurement",
      unit_of_measurement: "W",
    },
    name: "Generator Fan Wattage",
    unique_id: "generator_fan_wattage",
  },
};
type MappingName = keyof typeof mappings;
type Mapping = typeof mappings[MappingName];

const stateTopicOfMappingName = (
  mqttPrefix: string,
  mappingName: MappingName
) => {
  const mapping = mappings[mappingName];
  return `${mqttPrefix}/${mapping.domain}/${mapping.unique_id}`;
};

const updateMqtt = async (
  mqttConn: Mqtt.AsyncMqttClient,
  mqttPrefix: string,
  statesIn: Partial<Record<StateInTopic, string>>,
  statesOut: Partial<Record<MappingName, string>>
) => {
  log.info(`running mqtt update`);

  for (const [stateInNameString, mappingNameString] of Object.entries({
    "esphome/generator-plug/voltage": "sensor.generator_voltage",
    "esphome/generator-plug/wattage": "sensor.generator_fan_wattage",
  })) {
    const stateInName = <StateInTopic>stateInNameString;
    const mappingName = <MappingName>mappingNameString;

    if (statesOut[mappingName] !== statesIn[stateInName]) {
      log.info(
        `${mappingName} was: ${statesOut[mappingName]}; publishing: ${statesIn[stateInName]}`
      );

      statesOut[mappingName] = statesIn[stateInName];
      await mqttConn.publish(
        stateTopicOfMappingName(mqttPrefix, mappingName),
        statesOut[mappingName] ?? "null",
        { retain: false }
      );
    }
  }

  if (
    statesIn[`esphome/generator-plug/status`] !== "online" ||
    statesIn[`esphome/generator-plug/voltage`] === undefined ||
    statesIn[`esphome/generator-plug/wattage`] === undefined
  ) {
    // log.info(
    //   `generator_state = OFF: ${JSON.stringify({
    //     status: statesIn[`esphome/generator-plug/status`] ?? null,
    //     voltage: statesIn[`esphome/generator-plug/voltage`] ?? null,
    //     wattage: statesIn[`esphome/generator-plug/wattage`] ?? null,
    //   })}`
    // );

    if (statesOut["sensor.generator_state"] !== "OFF") {
      log.info(
        `${"sensor.generator_state"} was: ${
          statesOut["sensor.generator_state"]
        }; publishing: OFF`
      );

      statesOut["sensor.generator_state"] = "OFF";

      await mqttConn.publish(
        stateTopicOfMappingName(mqttPrefix, "sensor.generator_state"),
        statesOut["sensor.generator_state"],
        { retain: false }
      );
    }

    return;
  }

  if (
    statesIn[`esphome/generator-plug/status`] === "online" &&
    statesIn[`esphome/generator-plug/voltage`] !== undefined &&
    !isNaN(parseFloat(statesIn[`esphome/generator-plug/voltage`])) &&
    parseFloat(statesIn[`esphome/generator-plug/voltage`]) >= 110 &&
    statesIn[`esphome/generator-plug/wattage`] !== undefined &&
    !isNaN(parseFloat(statesIn[`esphome/generator-plug/wattage`])) &&
    parseFloat(statesIn[`esphome/generator-plug/wattage`]) >= 50
  ) {
    // log.info(
    //   `generator_state = RUNNING: ${JSON.stringify({
    //     status: statesIn[`esphome/generator-plug/status`] ?? null,
    //     voltage: statesIn[`esphome/generator-plug/voltage`] ?? null,
    //     wattage: statesIn[`esphome/generator-plug/wattage`] ?? null,
    //   })}`
    // );

    if (statesOut["sensor.generator_state"] !== "RUNNING") {
      log.info(
        `${"sensor.generator_state"} was: ${
          statesOut["sensor.generator_state"]
        }; publishing: RUNNING`
      );

      statesOut["sensor.generator_state"] = "RUNNING";
      await mqttConn.publish(
        stateTopicOfMappingName(mqttPrefix, "sensor.generator_state"),
        statesOut["sensor.generator_state"],
        { retain: false }
      );
    }

    return;
  }

  log.warn(`error state: ${JSON.stringify({ statesIn }, undefined, 4)}`);
  if (statesOut["sensor.generator_state"] !== "ERROR") {
    log.info(
      `${"sensor.generator_state"} was: ${
        statesOut["sensor.generator_state"]
      }; publishing: ERROR`
    );

    statesOut["sensor.generator_state"] = "ERROR";
    await mqttConn.publish(
      stateTopicOfMappingName(mqttPrefix, "sensor.generator_state"),
      statesOut["sensor.generator_state"],
      { retain: false }
    );
  }
};
const updateMqttForeverOnInterval = (
  mqttConn: Mqtt.AsyncMqttClient,
  mqttPrefix: string,
  statesIn: Partial<Record<StateInTopic, string>>,
  intervalMs: number
) => {
  log.info(`Setting up forever mqtt updater`);
  const statesOut: Partial<Record<MappingName, string>> = {};

  const updateFn = (): void =>
    void Promise.resolve()
      .then(() => updateMqtt(mqttConn, mqttPrefix, statesIn, statesOut))
      .then(async () => {
        await wait(intervalMs);
        process.nextTick(updateFn);
      });

  return updateFn();
};

const main = async () => {
  const mqttPrefix = process.env.MQTT_PREFIX!;

  log.info(`Connecting to mqtt via ${process.env.MQTT_URL!}`);
  const mqttConn = await Mqtt.connectAsync(process.env.MQTT_URL!, {
    will: {
      topic: `${mqttPrefix}/status`,
      payload: "offline",
      qos: 0,
      retain: true,
    },
  });
  await mqttConn.publish(`${mqttPrefix}/status`, "online", {
    qos: 0,
    retain: true,
  });

  log.info(`begin configuring HA`);
  for (const mappingName of <Array<MappingName>>[
    "sensor.generator_state",
    "sensor.generator_fan_wattage",
    "sensor.generator_voltage",
  ]) {
    const mapping = mappings[mappingName];
    const topic = `homeassistant/${mapping.domain}/${mapping.unique_id}/config`;
    const payload = JSON.stringify(
      {
        ...mapping.config,
        name: mapping.name,
        object_id: mapping.unique_id,
        state_topic: stateTopicOfMappingName(mqttPrefix, mappingName),
        unique_id: mapping.unique_id,
      },
      undefined,
      4
    );

    log.info(`configuring HA: ${topic}: ${payload}`);
    await mqttConn.publish(topic, payload, { retain: true });
  }

  log.info(`Set up statesIn and mqtt updater`);
  const statesIn: Partial<Record<StateInTopic, string>> = {};
  updateMqttForeverOnInterval(mqttConn, mqttPrefix, statesIn, 1_000);

  log.info(`set up mqtt onMessage`);
  mqttConn.on("message", async (topic, payload, _packet) => {
    if (stateInTopics.includes(topic as any)) {
      statesIn[<StateInTopic>topic] = payload.toString("utf-8");
      return;
    }

    log.warn(`unrecognized topic: ${topic}:: ${payload.toString("utf-8")}`);
  });

  log.info(`subscribe to: ${JSON.stringify(stateInTopics)}`);
  await mqttConn.subscribe([...stateInTopics]);
};

main();
