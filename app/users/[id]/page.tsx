export default async function Users ({
    params,}:{
    params: Promise<{id: string}>;
}) {

    const {id} = await params;

    return <h1>Users ID: {id}</h1>;
}