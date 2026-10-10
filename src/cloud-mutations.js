export function requireCloudId(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('A stable cloud lesson ID is required.');
  return id;
}
