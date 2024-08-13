import { Client } from "appwrite";

const client = new Client()
  .setEndpoint(import.meta.env.VITE_ENDPOINT)
  .setProject(import.meta.env.VITE_PROJECT_ID);

const collections = [
  {
    name: "notes",
    id: import.meta.env.VITE_COLLECTION_NOTES_ID,
    dbId: import.meta.env.VITE_DATABASE_ID
  },
];

const fetchAppwriteData = async () => {
  try {
    const response = await fetch(`https://cloud.appwrite.io/v1/databases/${collections[0].dbId}/collections/${collections[0].id}/documents`, {
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${client.getJWT()}`,
      },
    });
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
};

fetchAppwriteData();

export { client, collections };