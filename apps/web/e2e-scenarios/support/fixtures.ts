import { test as base, expect } from "@playwright/test";
import { joinTrainer, makeAdmin, makeTrainer, newPersona, type Persona, type PersonaOptions } from "./personas";

/*
 * Ready-made people for a scenario. A test asks for what it needs: `trainer` is a trainer with a
 * finished invite, `client` already trains with that trainer, `admin` has the admin role. Each test
 * gets fresh ones; `persona()` makes any extra person.
 */
type Fixtures = {
  persona: (options: PersonaOptions) => Promise<Persona>;
  trainer: Persona;
  client: Persona & { coachingId: string };
  admin: Persona;
};

export const test = base.extend<Fixtures>({
  persona: async ({ browser, baseURL }, provide) => {
    const made: Persona[] = [];
    await provide(async (options) => {
      const persona = await newPersona(browser, baseURL!, options);
      made.push(persona);
      return persona;
    });
    await Promise.all(made.map((persona) => persona.context.close()));
  },
  trainer: async ({ persona }, provide) => {
    const trainer = await persona({ firstName: "Иван", lastName: "Тренеров" });
    await makeTrainer(trainer);
    await provide(trainer);
  },
  client: async ({ persona, trainer }, provide) => {
    const client = await persona({ firstName: "Анна", lastName: "Клиентова" });
    const coachingId = await joinTrainer(client, trainer);
    await provide({ ...client, coachingId });
  },
  admin: async ({ persona }, provide) => {
    const admin = await persona({ firstName: "Ольга", lastName: "Админова" });
    await makeAdmin(admin);
    await provide(admin);
  },
});

export { expect };
