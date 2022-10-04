import Mqtt from "async-mqtt";
import { log } from "./utils";

const config = {
  mqtt: {
    url: "tcp://debian.lan:1883",
  },
};

const main = async () => {
  log.info(`MQTT-Connect: ${config.mqtt.url!}`);
  const mqttConn = await Mqtt.connectAsync(config.mqtt.url!, {
    will: {
      topic: `generator2mqtt/status`,
      payload: "offline",
      qos: 0,
      retain: true,
    },
  });
  await mqttConn.publish(`generator2mqtt/status`, "online", {
    qos: 0,
    retain: true,
  });

  const subscriptions: Record<string, Buffer | undefined> = {};
  const published: Record<string, Buffer | undefined> = {};
  const updateMqtt = async () => {
    const toPublish: typeof published = {};

    toPublish[`homeassistant/sensor/generator_voltage`] = Buffer.from(
      JSON.stringify({
        device: {
          identifiers: ["predator3500"],
          manufacturer: "Harbor Freight",
          model: "Predator 3500",
          name: "Generator",
        },
        device_class: "voltage",
        entity_category: "diagnostic",
        name: "Generator Voltage",
        state_class: "measurement",
        state_topic: `generator2mqtt/voltage`,
        unique_id: "generator_voltage",
        unit_of_measurement: "V",
      })
    );
    toPublish[`generator2mqtt/voltage`] =
      subscriptions[`esphome/generator-plug/voltage`];

    toPublish[`homeassistant/sensor/generator_fan_wattage`] = Buffer.from(
      JSON.stringify({
        device: {
          identifiers: ["predator3500"],
          manufacturer: "Harbor Freight",
          model: "Predator 3500",
          name: "Generator",
        },
        device_class: "power",
        entity_category: "diagnostic",
        name: "Generator Fan Wattage",
        state_class: "measurement",
        state_topic: `generator2mqtt/fan_wattage`,
        unique_id: "generator_fan_wattage",
        unit_of_measurement: "W",
      })
    );
    toPublish[`generator2mqtt/fan_wattage`] =
      subscriptions["esphome/generator-plug/wattage"];

    toPublish[`homeassistant/sensor/generator_state`] = Buffer.from(
      JSON.stringify({
        device: {
          identifiers: ["predator3500"],
          manufacturer: "Harbor Freight",
          model: "Predator 3500",
          name: "Generator",
        },
        name: "Generator State",
        state_topic: `generator2mqtt/state`,
        unique_id: `generator_state`,
      })
    );
    if (false) {
    } else if (
      subscriptions[`esphome/generator-plug/status`]?.toString("utf-8") !==
        "online" ||
      subscriptions[`esphome/generator-plug/voltage`] === undefined ||
      subscriptions[`esphome/generator-plug/wattage`] === undefined
    ) {
      toPublish[`generator2mqtt/state`] = Buffer.from("OFF");
    } else if (
      subscriptions[`esphome/generator-plug/status`]?.toString("utf-8") ===
        "online" &&
      subscriptions[`esphome/generator-plug/voltage`] !== undefined &&
      parseFloat(
        subscriptions[`esphome/generator-plug/voltage`]?.toString("utf-8")
      ) >= 110 &&
      subscriptions[`esphome/generator-plug/wattage`] !== undefined &&
      parseFloat(
        subscriptions[`esphome/generator-plug/wattage`]?.toString("utf-8")
      ) >= 50
    ) {
      toPublish[`generator2mqtt/state`] = Buffer.from("RUNNING");
    } else {
      log.warn(
        `error state: ${JSON.stringify(
          { statesIn: subscriptions },
          undefined,
          4
        )}`
      );
      toPublish[`generator2mqtt/state`] = Buffer.from("ERROR");
    }

    for (const [topic, payload] of Object.entries(toPublish)) {
      if (
        Buffer.compare(
          published[topic] ?? Buffer.from(""),
          payload ?? Buffer.from("")
        ) === 0
      ) {
        continue;
      }

      const from = (published[topic] ?? Buffer.from("")).toString("utf-8");
      const to = (toPublish[topic] ?? Buffer.from("")).toString("utf-8");
      log.info(`MQTT-Update: ${topic}: (${from}) -> (${to})`);

      await mqttConn.publish(topic, payload ?? Buffer.from(""), {
        qos: 0,
        retain: true,
      });
      published[topic] = payload;
    }

    process.nextTick(updateMqtt);
  };

  log.info(`set up mqtt onMessage`);
  const subscriptionTopics = [
    `esphome/generator-plug/status`,
    `esphome/generator-plug/voltage`,
    `esphome/generator-plug/wattage`,
  ];
  log.info(`MQTT-Subscribe: ${JSON.stringify(subscriptionTopics)}`);
  await mqttConn.subscribe(subscriptionTopics);

  mqttConn.on("message", async (topic, payload, _packet) => {
    if (subscriptionTopics.includes(topic)) {
      subscriptions[topic] = payload;
      return;
    }

    log.warn(`unrecognized topic: ${topic}:: ${payload.toString("utf-8")}`);
  });
};

main();
