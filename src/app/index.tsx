import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const h = React.createElement;
const BUFFER_MIN = 10;
const NI_BBOX = "-8.2,54.0,-5.4,55.4"; // Northern Ireland

type Place = { label: string; lat: number; lon: number };

async function searchPlaces(q: string): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en&bbox=${NI_BBOX}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.features ?? []).map((f: any) => {
    const p = f.properties;
    const parts = [p.name, p.street, p.city, p.postcode].filter(Boolean);
    return {
      label: Array.from(new Set(parts)).join(", "),
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    };
  });
}

async function resolve(text: string): Promise<Place> {
  const results = await searchPlaces(text);
  if (!results.length)
    throw new Error(
      `Couldn't find "${text}". Pick from the suggestions or try a postcode.`,
    );
  return results[0];
}

async function driveMinutes(a: Place, b: Place): Promise<number> {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== "Ok")
    throw new Error("No driving route found between those places.");
  return Math.ceil(data.routes[0].duration / 60);
}

function PlaceInput(props: {
  placeholder: string;
  text: string;
  onText: (t: string) => void;
  onSelect: (p: Place) => void;
}) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || props.text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchPlaces(props.text)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [props.text, open]);

  const items = suggestions.map((p, i) =>
    h(
      Pressable,
      {
        key: `${p.lat}-${p.lon}-${i}`,
        style: s.item,
        onPress: () => {
          props.onText(p.label);
          props.onSelect(p);
          setOpen(false);
          setSuggestions([]);
        },
      },
      h(Text, { style: s.itemText }, p.label),
    ),
  );

  return h(
    View,
    { style: { marginBottom: 12 } },
    h(TextInput, {
      style: s.input,
      value: props.text,
      placeholder: props.placeholder,
      onChangeText: (t: string) => {
        props.onText(t);
        setOpen(true);
      },
    }),
    open && suggestions.length > 0
      ? h(View, { style: s.list }, ...items)
      : null,
  );
}

export default function WhereTo() {
  const [fromText, setFromText] = useState("Belfast City Hall");
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toText, setToText] = useState("");
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [arriveBy, setArriveBy] = useState("09:00");
  const [leaveAt, setLeaveAt] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function planIt() {
    setLoading(true);
    setError(null);
    setLeaveAt(null);
    setDetail(null);
    try {
      const a = fromPlace ?? (await resolve(fromText));
      const b = toPlace ?? (await resolve(toText));
      const mins = await driveMinutes(a, b);

      const [hh, mm] = arriveBy.split(":").map(Number);
      if (Number.isNaN(hh) || Number.isNaN(mm))
        throw new Error("Enter the arrival time as HH:MM, for example 09:00.");

      const arrive = new Date();
      arrive.setHours(hh, mm, 0, 0);
      const leave = new Date(arrive.getTime() - (mins + BUFFER_MIN) * 60000);

      setLeaveAt(`Leave at ${leave.toTimeString().slice(0, 5)}`);
      setDetail(`Drive ${mins} min + ${BUFFER_MIN} min buffer`);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !toText;

  return h(
    View,
    { style: s.wrap },
    h(Text, { style: s.title }, "Where to?"),
    h(PlaceInput, {
      placeholder: "From",
      text: fromText,
      onText: (t: string) => {
        setFromText(t);
        setFromPlace(null);
      },
      onSelect: setFromPlace,
    }),
    h(PlaceInput, {
      placeholder: "Destination",
      text: toText,
      onText: (t: string) => {
        setToText(t);
        setToPlace(null);
      },
      onSelect: setToPlace,
    }),
    h(TextInput, {
      style: s.input,
      value: arriveBy,
      onChangeText: setArriveBy,
      placeholder: "Arrive by (HH:MM)",
    }),
    h(
      Pressable,
      { style: [s.btn, disabled && s.btnDisabled], onPress: planIt, disabled },
      h(Text, { style: s.btnText }, "Plan it"),
    ),
    loading ? h(ActivityIndicator, { style: { marginTop: 20 } }) : null,
    error ? h(Text, { style: s.error }, error) : null,
    leaveAt ? h(Text, { style: s.result }, leaveAt) : null,
    detail ? h(Text, { style: s.detail }, detail) : null,
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "700", marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  list: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginTop: -12,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  itemText: { fontSize: 15 },
  btn: {
    backgroundColor: "#1a73e8",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  result: { fontSize: 28, fontWeight: "700", marginTop: 24 },
  detail: { fontSize: 16, color: "#555", marginTop: 6 },
  error: { color: "#c00", marginTop: 20 },
});
