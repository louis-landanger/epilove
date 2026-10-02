import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  CheckboxField,
  ChoiceGroup,
  OtpInput,
  RadioGroupField,
  RangeField,
  SwitchField,
  TextAreaField,
  TextField,
} from "../index";

const meta: Meta = { title: "Champs" };
export default meta;

export const Text: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-5">
      <TextField
        label="Email d'école"
        placeholder="prenom.nom@ton-ecole.fr"
        description="EPITA, ESME, Sup'Biotech, ISG ou IPSA."
      />
      <TextField
        label="Prénom"
        defaultValue="Camille"
        error="Ce prénom contient des caractères non autorisés."
      />
      <TextAreaField
        label="Ta réponse"
        maxLength={200}
        defaultValue="Les crêpes du jeudi au foyer."
        rows={3}
      />
    </div>
  ),
};

export const Choices: StoryObj = {
  render: function Render() {
    const [modes, setModes] = useState<string[]>(["friends"]);
    const [why, setWhy] = useState<string | null>("respect");
    const [checked, setChecked] = useState(true);
    const [on, setOn] = useState(false);
    return (
      <div className="flex flex-col gap-6">
        <ChoiceGroup
          label="Je cherche"
          multiple
          value={modes}
          onChange={setModes}
          choices={[
            { value: "love", label: "L'amour", description: "Rencontres" },
            { value: "friends", label: "Des amis", description: "Amitiés" },
          ]}
        />
        <RadioGroupField
          label="Motif"
          value={why}
          onChange={setWhy}
          options={[
            { value: "respect", label: "Respect", description: "Insultes, harcèlement" },
            { value: "spam", label: "Spam" },
            { value: "other", label: "Autre", disabled: true },
          ]}
        />
        <CheckboxField label="J'accepte la charte" checked={checked} onCheckedChange={setChecked} />
        <SwitchField
          label="Mode incognito"
          description="Visible seulement des personnes que tu as likées."
          checked={on}
          onCheckedChange={setOn}
        />
      </div>
    );
  },
};

export const RangeAndCode: StoryObj = {
  render: function Render() {
    const [ages, setAges] = useState<[number, number]>([19, 26]);
    const [code, setCode] = useState("482");
    return (
      <div className="flex flex-col gap-6">
        <RangeField
          label="Tranche d'âge"
          min={18}
          max={45}
          value={ages}
          onChange={setAges}
          thumbLabels={["Âge minimum", "Âge maximum"]}
        />
        <OtpInput label="Code à 6 chiffres" value={code} onChange={setCode} />
      </div>
    );
  },
};
